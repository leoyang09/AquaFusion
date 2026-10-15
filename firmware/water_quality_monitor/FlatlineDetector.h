#pragma once
#include <math.h>
#include <stdint.h>

// Flags a sensor channel whose raw signal has stopped varying.
// Keeps the last N raw readings in a ring buffer and computes their
// standard deviation directly, so a sensor that dies after weeks of
// good data is still caught once the window fills with stuck values.
template <int N>
class FlatlineDetector {
public:
    FlatlineDetector() : _head(0), _count(0) {}

    void update(float v) {
        _buf[_head] = v;
        _head = (_head + 1) % N;
        if (_count < N) _count++;
    }

    bool ready() const { return _count >= N; }

    float stddev() const {
        if (_count < 2) return 0.0f;
        double mean = 0.0;
        for (int i = 0; i < _count; i++) mean += _buf[i];
        mean /= _count;
        double ss = 0.0;
        for (int i = 0; i < _count; i++) { double d = _buf[i] - mean; ss += d * d; }
        return (float)sqrt(ss / (_count - 1));
    }

    // Only judges once the window is full, to avoid false flags at boot.
    bool isFlat(float threshold) const { return ready() && stddev() < threshold; }

    void reset() { _head = 0; _count = 0; }

private:
    float _buf[N];
    int   _head;
    int   _count;
};
