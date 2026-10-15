#include "Depth_Sensor.h"
#include "Config.h"
#include <Arduino.h>

static float _lastMv = 0.0f;

void depthSensor_init() {
    analogReadResolution(12);
    analogSetPinAttenuation(DEPTH_ADC_PIN, ADC_11db);
}

float depthSensor_readM() {
    uint32_t sum = 0;
    for (int i = 0; i < DEPTH_SAMPLES; i++) {
        sum += analogReadMilliVolts(DEPTH_ADC_PIN);
        delayMicroseconds(200);
    }
    float mv = (float)sum / DEPTH_SAMPLES * DEPTH_DIVIDER_RATIO;
    _lastMv = mv;

    float depth = (mv - DEPTH_ZERO_MV) / (DEPTH_FULL_MV - DEPTH_ZERO_MV) * DEPTH_RANGE_M;
    return constrain(depth, 0.0f, DEPTH_RANGE_M);
}

float depthSensor_lastMillivolts() { return _lastMv; }
