#pragma once

void depthSensor_init();

float depthSensor_readCM();

const char* depthSensor_classify(float cm);
