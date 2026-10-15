#pragma once

#include <Adafruit_ADS1X15.h>

struct ADSReadings {
    float phVoltage;
    float tdsVoltage;
    float turbidityVoltage;
    float ph;
    float tdsPPM;
    float turbidityNTU;
};

bool adsSensors_init();

ADSReadings adsSensors_read();

float adsSensors_readVolts(uint8_t channel);
