/*
 *  Timer.h
 *  Advanced2D
 *
 *  Created by Ralph Smith on 7/10/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#ifndef __TIMER_H__
#define __TIMER_H__

#if _WIN32 // Windows Platform
#include <windows.h>
#else //everything else not windows
#include <sys/time.h>
#endif

class Timer
{
private:
	double timer_start;
	double stopwatch_start;

public:
	Timer(void);
	~Timer(void);
	double getTimer();
	double getStartTimeMs();

	void sleep(int ms);
	void reset();
	bool stopwatch(int ms);
	
	static double GetTime();
	static double GetTimeMs();

};

#endif
