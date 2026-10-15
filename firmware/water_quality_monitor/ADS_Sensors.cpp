#include "ADS_Sensors.h"

static Adafruit_ADS1115 _ads;

static const float CLEAR_WATER_VOLTAGE  = 3.87f;
static const float PH_CALIBRATION_VALUE = 21.34f;
static const float DIVIDER_RATIO        = (10.0f + 20.0f) / 20.0f;

bool adsSensors_init() {
    if (!_ads.begin(0x48)) {
        return false;
    }
    _ads.setGain(GAIN_ONE);
    return true;
}

ADSReadings adsSensors_read() {
    ADSReadings r;

    int16_t rawPh   = _ads.readADC_SingleEnded(1);
    int16_t rawTds  = _ads.readADC_SingleEnded(2);
    int16_t rawTurb = _ads.readADC_SingleEnded(3);

    float measuredPh   = _ads.computeVolts(rawPh);
    float measuredTds  = _ads.computeVolts(rawTds);
    float measuredTurb = _ads.computeVolts(rawTurb);

    r.phVoltage        = measuredPh   * DIVIDER_RATIO;
    r.tdsVoltage       = measuredTds  * DIVIDER_RATIO;
    r.turbidityVoltage = measuredTurb * DIVIDER_RATIO;

    float v = r.tdsVoltage;
    r.tdsPPM = (133.42f * v * v * v - 255.86f * v * v + 857.39f * v) * 0.5f;
    if (r.tdsPPM < 0.0f) r.tdsPPM = 0.0f;

    if (r.turbidityVoltage < CLEAR_WATER_VOLTAGE) {
        r.turbidityNTU = (CLEAR_WATER_VOLTAGE - r.turbidityVoltage) * (3000.0f / 1.3f);
    } else {
        r.turbidityNTU = 0.0f;
    }

    r.ph = (-5.70f * r.phVoltage) + PH_CALIBRATION_VALUE;
    if (r.ph < 0.0f)  r.ph = 0.0f;
    if (r.ph > 14.0f) r.ph = 14.0f;

    return r;
}

float adsSensors_readVolts(uint8_t channel) {
    return _ads.computeVolts(_ads.readADC_SingleEnded(channel));
}
