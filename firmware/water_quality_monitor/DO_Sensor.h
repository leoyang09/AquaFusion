#pragma once

void doSensor_init();

// Dissolved oxygen in mg/L, temperature compensated.
float doSensor_readMGL(float tempC);

float doSensor_lastMillivolts();
