#include "Depth_Sensor.h"
#include <Arduino.h>

void depthSensor_init() {

    randomSeed(analogRead(A3));
}

float depthSensor_readCM() {

    return random(0, 101) / 10.0f;
}

const char* depthSensor_classify(float cm) {
    if (cm <  2.0f) return "Very Shallow";
    if (cm <  5.0f) return "Shallow";
    if (cm < 10.0f) return "Moderate";
    return                 "Deep";
}
