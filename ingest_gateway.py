"""
AquaFusion ingest gateway
FastAPI server that receives sensor readings over HTTP at /api/ingest,
persists them to Supabase, and sends a Resend email alert for any anomaly.
"""

import json
import os
import urllib.error
import urllib.request
from contextlib import asynccontextmanager
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

load_dotenv(".env.server")

# Config
SUPABASE_URL: str = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY: str = os.environ["SUPABASE_SERVICE_KEY"]
RESEND_API_KEY: str = os.environ["RESEND_API_KEY"]
GATEWAY_SECRET: str = os.environ["GATEWAY_SECRET"]
FROM_EMAIL: str = os.getenv("FROM_EMAIL", "AquaFusion Alerts <alerts@aquafusion.io>")

ALERT_RECIPIENTS = ["leo.yang.98033@gmail.com"]

# Supabase PostgREST - no native library, plain HTTP
SUPABASE_REST_URL = f"{SUPABASE_URL}/rest/v1/sensor_logs"
SUPABASE_HEADERS = {
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "apikey": SUPABASE_SERVICE_KEY,
    "Content-Type": "application/json",
    "Prefer": "return=representation",  # return the inserted row so we can echo its id
}

bearer = HTTPBearer()

# Startup banner
SETUP_INSTRUCTIONS = r"""
AquaFusion ingest gateway: local setup

1. Create .env.server in the project root (see .env.server.example):
     SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY, GATEWAY_SECRET, FROM_EMAIL
2. Install dependencies:
     pip install fastapi uvicorn httpx python-dotenv
3. Run the server:
     uvicorn ingest_gateway:app --reload --port 8000
4. Test it:
     curl -X POST http://localhost:8000/api/ingest \
       -H "Authorization: Bearer <GATEWAY_SECRET>" \
       -H "Content-Type: application/json" \
       -d '{"sonde_id":"sonde_12","location_name":"River A", ...}'
5. API docs: http://localhost:8000/docs

Use the Supabase service-role key here, never in the mobile app.
"""


@asynccontextmanager
async def lifespan(application: FastAPI):
    print(SETUP_INSTRUCTIONS)
    yield


# App
app = FastAPI(
    title="AquaFusion Ingest Gateway",
    description="Receives sensor readings over HTTP, persists them to Supabase, and sends anomaly email alerts.",
    version="1.0.0",
    lifespan=lifespan,
)

# Auth
def require_token(creds: HTTPAuthorizationCredentials = Depends(bearer)) -> None:
    if creds.credentials != GATEWAY_SECRET:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid gateway token.",
        )


# Request schema
class SensorPacket(BaseModel):
    sonde_id: str
    location_name: str
    temperature: float
    dissolved_oxygen: float
    ph: float
    turbidity: float
    water_depth: float
    is_anomaly: bool
    anomaly_source: Optional[str] = ""
    confidence_level: Optional[float] = 0.0
    std_dissolved_oxygen: Optional[float] = 0.0
    std_temperature: Optional[float] = 0.0
    std_ph: Optional[float] = 0.0
    std_turbidity: Optional[float] = 0.0
    std_water_depth: Optional[float] = 0.0


# Email alert
def _send_anomaly_alert(packet: SensorPacket) -> None:
    html_body = f"""
    <div style="font-family:sans-serif;max-width:620px;margin:auto;
                background:#001C44;color:#e8f0ff;border-radius:14px;padding:36px;">
      <h2 style="color:#FF4D4D;margin-top:0;letter-spacing:0.5px;">
        &#9888; AquaFusion Anomaly Detected
      </h2>

      <table style="width:100%;border-collapse:collapse;margin-bottom:28px;
                    background:rgba(255,255,255,0.06);border-radius:10px;padding:16px;">
        <tr>
          <td style="padding:10px 14px;color:#7eaaff;font-weight:600;width:45%;">Sonde ID</td>
          <td style="padding:10px 14px;">{packet.sonde_id}</td>
        </tr>
        <tr style="background:rgba(255,255,255,0.04);">
          <td style="padding:10px 14px;color:#7eaaff;font-weight:600;">Location</td>
          <td style="padding:10px 14px;">{packet.location_name}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;color:#7eaaff;font-weight:600;">Anomaly Source</td>
          <td style="padding:10px 14px;color:#FF4D4D;font-weight:700;">{packet.anomaly_source or "Unknown"}</td>
        </tr>
        <tr style="background:rgba(255,255,255,0.04);">
          <td style="padding:10px 14px;color:#7eaaff;font-weight:600;">Confidence (preset)</td>
          <td style="padding:10px 14px;">{(packet.confidence_level or 0):.1%}</td>
        </tr>
      </table>

      <h3 style="color:#7eaaff;margin-bottom:12px;">Live Sensor Readings</h3>
      <table style="width:100%;border-collapse:collapse;
                    background:rgba(255,255,255,0.06);border-radius:10px;">
        <thead>
          <tr style="background:rgba(255,255,255,0.1);">
            <th style="padding:10px 14px;text-align:left;color:#7eaaff;">Parameter</th>
            <th style="padding:10px 14px;text-align:left;color:#7eaaff;">Value</th>
            <th style="padding:10px 14px;text-align:left;color:#7eaaff;">Std Dev (&sigma;)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:9px 14px;color:#aac4ff;">Temperature</td>
            <td style="padding:9px 14px;">{packet.temperature:.1f} &deg;C</td>
            <td style="padding:9px 14px;color:#888;">{packet.std_temperature:.4f}</td>
          </tr>
          <tr style="background:rgba(255,255,255,0.04);">
            <td style="padding:9px 14px;color:#aac4ff;">Dissolved Oxygen</td>
            <td style="padding:9px 14px;">{packet.dissolved_oxygen:.1f} mg/L</td>
            <td style="padding:9px 14px;color:#888;">{packet.std_dissolved_oxygen:.4f}</td>
          </tr>
          <tr>
            <td style="padding:9px 14px;color:#aac4ff;">pH</td>
            <td style="padding:9px 14px;">{packet.ph:.2f}</td>
            <td style="padding:9px 14px;color:#888;">{packet.std_ph:.4f}</td>
          </tr>
          <tr style="background:rgba(255,255,255,0.04);">
            <td style="padding:9px 14px;color:#aac4ff;">Turbidity</td>
            <td style="padding:9px 14px;">{packet.turbidity:.1f} NTU</td>
            <td style="padding:9px 14px;color:#888;">{packet.std_turbidity:.4f}</td>
          </tr>
          <tr>
            <td style="padding:9px 14px;color:#aac4ff;">Water Depth</td>
            <td style="padding:9px 14px;">{packet.water_depth:.2f} m</td>
            <td style="padding:9px 14px;color:#888;">{packet.std_water_depth:.4f}</td>
          </tr>
        </tbody>
      </table>

      <p style="margin-top:28px;font-size:11px;color:#445566;">
        Automated alert from the AquaFusion monitoring system.
        Log in to the dashboard to acknowledge and clear this alarm.
      </p>
    </div>
    """

    payload = json.dumps({
        "from": FROM_EMAIL,
        "to": ALERT_RECIPIENTS,
        "subject": (
            f"[ANOMALY] {packet.sonde_id} @ {packet.location_name}"
            f" - {packet.anomaly_source or 'Unknown source'}"
        ),
        "html": html_body,
    }).encode()

    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
            "User-Agent": "AquaFusionGateway/1.0",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            resend_reply = json.loads(resp.read())
            print(f"email alert sent: id={resend_reply.get('id')}, to={ALERT_RECIPIENTS}")
    except urllib.error.HTTPError as exc:
        print(f"Resend error {exc.code}: {exc.read().decode()}")
    except urllib.error.URLError as exc:
        print(f"could not reach Resend: {exc.reason}")
    except Exception as exc:
        print(f"email alert failed: {exc}")


# Ingest endpoint
@app.post("/api/ingest", status_code=status.HTTP_201_CREATED)
def ingest(
    packet: SensorPacket,
    _: None = Depends(require_token),
) -> dict:
    row = {
        "sonde_id": packet.sonde_id,
        "location_name": packet.location_name,
        "temperature": packet.temperature,
        "dissolved_oxygen": packet.dissolved_oxygen,
        "ph": packet.ph,
        "turbidity": packet.turbidity,
        "water_depth": packet.water_depth,
        "is_anomaly": packet.is_anomaly,
        "anomaly_source": packet.anomaly_source,
        "confidence_level": int(packet.confidence_level or 0),
        "std_dev_do": packet.std_dissolved_oxygen,
        "std_dev_temp": packet.std_temperature,
        "std_dev_ph": packet.std_ph,
        "std_dev_turbidity": packet.std_turbidity,
        "std_dev_depth": packet.std_water_depth,
    }

    resp = httpx.post(SUPABASE_REST_URL, headers=SUPABASE_HEADERS, json=row, timeout=10)

    if resp.status_code not in (200, 201):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Supabase insert failed {resp.status_code}: {resp.text}",
        )

    inserted = resp.json()
    inserted_id = inserted[0].get("id") if inserted else None

    if packet.is_anomaly:
        _send_anomaly_alert(packet)

    return {"status": "ok", "inserted_id": inserted_id}


# Entry point
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("ingest_gateway:app", host="0.0.0.0", port=8000, reload=True)
