#pragma once

void depthSensor_init();

// Water depth above the transducer, in metres.
float depthSensor_readM();

float depthSensor_lastMillivolts();
