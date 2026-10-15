#pragma once

#define TDS_PIN A2

void tdsSensor_init();

float tdsSensor_readPPM(float tempC);

const char* tdsSensor_classify(float ppm);
