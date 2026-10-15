#include "DO_Sensor.h"
#include "ADS_Sensors.h"
#include "Config.h"
#include <Arduino.h>

// Oxygen solubility in fresh water, ug/L, at 0..40 C.
static const uint16_t DO_TABLE[41] = {
    14460, 14220, 13820, 13440, 13090, 12740, 12420, 12110, 11810, 11530,
    11260, 11010, 10770, 10530, 10300, 10080,  9860,  9660,  9460,  9270,
     9080,  8900,  8730,  8570,  8410,  8250,  8110,  7960,  7820,  7690,
     7560,  7430,  7300,  7180,  7070,  6950,  6840,  6730,  6630,  6530,
     6410
};

static float _lastMv = 0.0f;

static float saturationUgL(float tempC) {
    tempC = constrain(tempC, 0.0f, 40.0f);
    int lo = (int)tempC;
    if (lo >= 40) return DO_TABLE[40];
    float frac = tempC - lo;
    return DO_TABLE[lo] + frac * (DO_TABLE[lo + 1] - DO_TABLE[lo]);
}

static float saturationMv(float tempC) {
#if DO_TWO_POINT_CAL
    return (tempC - DO_CAL2_TEMP_C) * (DO_CAL1_MV - DO_CAL2_MV)
           / (DO_CAL1_TEMP_C - DO_CAL2_TEMP_C) + DO_CAL2_MV;
#else
    return DO_CAL1_MV + 35.0f * (tempC - DO_CAL1_TEMP_C);
#endif
}

void doSensor_init() {}

float doSensor_readMGL(float tempC) {
    float mv = adsSensors_readVolts(DO_ADS_CHANNEL) * DO_DIVIDER_RATIO * 1000.0f;
    _lastMv = mv;

    float vSat = saturationMv(tempC);
    if (vSat <= 0.0f) return 0.0f;

    float mgL = mv * saturationUgL(tempC) / vSat / 1000.0f;
    return constrain(mgL, 0.0f, 20.0f);
}

float doSensor_lastMillivolts() { return _lastMv; }
