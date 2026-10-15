#include "Temperature_Sensor.h"

static OneWire           _oneWire(ONE_WIRE_BUS);
static DallasTemperature _sensors(&_oneWire);

void tempSensor_init() {
    _sensors.begin();
}

float tempSensor_readC() {
    _sensors.requestTemperatures();
    float t = _sensors.getTempCByIndex(0);
    if (t == DEVICE_DISCONNECTED_C) return -127.0f;
    return t;
}
