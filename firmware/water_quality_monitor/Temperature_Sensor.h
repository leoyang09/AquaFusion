#pragma once

#include <OneWire.h>
#include <DallasTemperature.h>

#define ONE_WIRE_BUS 4

void tempSensor_init();

float tempSensor_readC();
