#pragma once
#include <math.h>

class RunningStats {
public:
    RunningStats() : _n(0), _mean(0.0f), _m2(0.0f) {}

    void update(float value) {
        _n++;
        float delta = value - _mean;
        _mean += delta / _n;
        float delta2 = value - _mean;
        _m2 += delta * delta2;
    }

    float mean() const { return _mean; }

    float stddev() const {
        if (_n < 2) return 0.0f;
        return sqrtf(_m2 / (_n - 1));
    }

    int count() const { return _n; }

private:
    int   _n;
    float _mean;
    float _m2;
};
