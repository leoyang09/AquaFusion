#pragma once

#define PH_PIN A1

void phSensor_init();

float phSensor_readPH();

const char* phSensor_classify(float ph);
