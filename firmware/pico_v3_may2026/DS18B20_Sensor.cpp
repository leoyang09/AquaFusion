#include "DS18B20_Sensor.h"

static OneWire           _ow(DS18B20_PIN);
static DallasTemperature _sensors(&_ow);

void tempSensor_init() {
    _sensors.begin();
}

float tempSensor_readC() {
    _sensors.requestTemperatures();
    float t = _sensors.getTempCByIndex(0);
    if (t == DEVICE_DISCONNECTED_C) return -127.0f;
    return t;
}

const char* tempSensor_classify(float tempC) {
    if (tempC < -100.0f) return "Error / Disconnected";
    if (tempC <    0.0f) return "Freezing";
    if (tempC <   10.0f) return "Very Cold";
    if (tempC <   20.0f) return "Cold";
    if (tempC <   25.0f) return "Cool";
    if (tempC <   35.0f) return "Warm";
    if (tempC <   45.0f) return "Hot";
    return                      "Very Hot";
}
