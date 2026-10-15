#include "SupabaseClient.h"
#include "Config.h"
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

void supabase_init() {

}

bool supabase_sendSensorLog(const SensorLogPayload& p) {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println(F("# [Supabase] WiFi not connected - skipping upload."));
        return false;
    }

    WiFiClientSecure client;
    client.setInsecure();

    HTTPClient http;
    String url = String(SUPABASE_URL) + "/rest/v1/sensor_logs";

    if (!http.begin(client, url)) {
        Serial.println(F("# [Supabase] http.begin() failed"));
        return false;
    }

    http.addHeader("Content-Type", "application/json");
    http.addHeader("apikey", SUPABASE_API_KEY);
    http.addHeader("Authorization", String("Bearer ") + SUPABASE_API_KEY);
    http.addHeader("Prefer", "return=minimal");

    char body[640];
    snprintf(body, sizeof(body),
        "{"
        "\"sonde_id\":\"%s\","
        "\"location_name\":\"%s\","
        "\"temperature\":%.2f,"
        "\"dissolved_oxygen\":%.2f,"
        "\"ph\":%.2f,"
        "\"turbidity\":%.2f,"
        "\"water_depth\":%.2f,"
        "\"is_anomaly\":%s,"
        "\"anomaly_source\":\"%s\","
        "\"confidence_level\":%d,"
        "\"std_dev_do\":%.4f,"
        "\"std_dev_temp\":%.4f,"
        "\"std_dev_ph\":%.4f,"
        "\"std_dev_turbidity\":%.4f,"
        "\"std_dev_depth\":%.4f"
#if FLATLINE_UPLOAD
        ",\"sensor_fault\":\"%s\""
#endif
        "}",
        p.sonde_id,
        p.location_name,
        p.temperature,
        p.dissolved_oxygen,
        p.ph,
        p.turbidity,
        p.water_depth,
        p.is_anomaly ? "true" : "false",
        p.anomaly_source,
        p.confidence_level,
        p.std_dev_do,
        p.std_dev_temp,
        p.std_dev_ph,
        p.std_dev_turbidity,
        p.std_dev_depth
#if FLATLINE_UPLOAD
        , p.sensor_fault
#endif
    );

    int statusCode = http.POST((uint8_t*)body, strlen(body));

    bool ok = (statusCode >= 200 && statusCode < 300);

    Serial.print(F("# [Supabase] POST -> HTTP "));
    Serial.println(statusCode);

    if (!ok) {
        String resp = http.getString();
        Serial.print(F("# [Supabase] Response body: "));
        Serial.println(resp);
        Serial.print(F("# [Supabase] Request body was: "));
        Serial.println(body);
    }

    http.end();
    return ok;
}
