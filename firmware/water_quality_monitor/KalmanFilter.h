#pragma once

class KalmanFilter {
public:
    KalmanFilter(float measurementNoise, float processNoise)
        : _R(measurementNoise)
        , _Q(processNoise)
        , _x(0.0f)
        , _p(1.0f)
        , _seeded(false)
    {}

    float update(float measurement) {
        if (!_seeded) {
            _x = measurement;
            _seeded = true;
            return _x;
        }

        _p = _p + _Q;

        float k = _p / (_p + _R);
        _x = _x + k * (measurement - _x);
        _p = (1.0f - k) * _p;

        return _x;
    }

    float estimate() const { return _x; }

    void reset(float value) {
        _x = value;
        _p = 1.0f;
        _seeded = true;
    }

private:
    float _R, _Q, _x, _p;
    bool  _seeded;
};
