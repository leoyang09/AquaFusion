#include "Turbidity_Sensor.h"
#include <Arduino.h>

static const int   TURB_SAMPLES      = 10;
static const int   TURB_SAMPLE_DELAY = 10;
static const float TURB_VREF         = 3.3f;
static const int   TURB_ADC_MAX      = 4095;

struct CalPoint { float voltage; float ntu; };

static const CalPoint CAL[] = {
    { 4.10f,    0.0f },
    { 3.80f,  200.0f },
    { 3.50f,  500.0f },
    { 3.00f, 1000.0f },
    { 2.50f, 2000.0f },
    { 2.00f, 3000.0f },
    { 1.00f, 3800.0f },
    { 0.00f, 4000.0f },
};
static const int CAL_SIZE = sizeof(CAL) / sizeof(CAL[0]);

void turbiditySensor_init() {
    pinMode(TURBIDITY_PIN, INPUT);
}

static float _readVoltage() {
    long total = 0;
    for (int i = 0; i < TURB_SAMPLES; i++) {
        total += analogRead(TURBIDITY_PIN);
        delay(TURB_SAMPLE_DELAY);
    }
    float avg = (float)total / TURB_SAMPLES;
    return (avg / TURB_ADC_MAX) * TURB_VREF * TURBIDITY_VOLTAGE_SCALE;
}

static float _voltageToNTU(float v) {
    if (v >= CAL[0].voltage) return CAL[0].ntu;
    if (v <= CAL[CAL_SIZE - 1].voltage) return CAL[CAL_SIZE - 1].ntu;

    for (int i = 0; i < CAL_SIZE - 1; i++) {
        if (v <= CAL[i].voltage && v >= CAL[i + 1].voltage) {
            float ratio = (v - CAL[i].voltage) / (CAL[i+1].voltage - CAL[i].voltage);
            return CAL[i].ntu + ratio * (CAL[i+1].ntu - CAL[i].ntu);
        }
    }
    return 0.0f;
}

float turbiditySensor_readNTU() {
    return _voltageToNTU(_readVoltage());
}

const char* turbiditySensor_classify(float ntu) {
    if (ntu <   50) return "Excellent";
    if (ntu <  200) return "Good";
    if (ntu < 1000) return "Fair";
    if (ntu < 2500) return "Poor";
    if (ntu < 3500) return "Very Poor";
    return                 "Extreme";
}
