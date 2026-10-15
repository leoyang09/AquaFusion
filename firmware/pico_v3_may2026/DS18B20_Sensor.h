#pragma once

#include <OneWire.h>
#include <DallasTemperature.h>

#define DS18B20_PIN 22

void tempSensor_init();

float tempSensor_readC();

const char* tempSensor_classify(float tempC);
