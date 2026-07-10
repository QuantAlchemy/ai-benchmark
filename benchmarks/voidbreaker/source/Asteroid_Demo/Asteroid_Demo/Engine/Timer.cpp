/*
 *  Timer.cpp
 *  Advanced2D
 *
 *  Created by Ralph Smith on 7/10/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#include "Timer.h"

Timer::Timer(void)
{
	timer_start = GetTimeMs();
	reset();
}

Timer::~Timer(void) {}

double Timer::GetTime()
{
	// return time in seconds
#if _WIN32
	return (timeGetTime()/1000.0f);
#else
	struct timeval tv;
	gettimeofday (&tv, 0);

	return ((double)tv.tv_sec + (double)tv.tv_usec/1000000.0f);
#endif
}

double Timer::GetTimeMs()
{
	// return time in milliseconds
#if _WIN32
	return timeGetTime();
#else
	struct timeval tv;
	gettimeofday (&tv, 0);
	return ((double)tv.tv_sec*1000.0f + (double)tv.tv_usec/1000.0f);
#endif
}

double Timer::getTimer()
{
	return (GetTime());
}

double Timer::getStartTimeMs()
{
	return (GetTimeMs() - timer_start);
}


void Timer::sleep(int ms)
{
	double start = getTimer();
	double sleepTime = start + (double)ms/1000.0f;
	while (sleepTime > getTimer());
}

void Timer::reset()
{
	stopwatch_start = getTimer();
}

bool Timer::stopwatch(int ms)
{
	
	if ( GetTime() > stopwatch_start + (double)ms/1000.0f ) {
		stopwatch_start = getTimer();
		return true;
	}
	else return false;
}
