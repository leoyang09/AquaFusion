#pragma once

#define TURBIDITY_PIN           A0
#define TURBIDITY_VOLTAGE_SCALE 1.0f

void turbiditySensor_init();

float turbiditySensor_readNTU();

const char* turbiditySensor_classify(float ntu);
