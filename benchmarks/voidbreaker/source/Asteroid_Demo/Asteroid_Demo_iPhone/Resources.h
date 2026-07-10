/*
 *  Resources.h
 *  Advanced2D
 *
 *  Created by Ralph Smith on 9/5/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 *	This file provides a single place to define the location of the
 *	resources folder. Ideally you would find it in code but this make it easy
 *	so that you do not have to write separate code to load the resources
 *	based on what platform you are using.
 *
 */



#if __IPHONE_OS_VERSION_MIN_REQUIRED
// -- this should be the absolute path to the Resources file
#define RESOURCES "/Users/ralphs/Desktop/Asteroid_Demo/Asteroid_Demo_iPhone/Resources/"
#elif __APPLE__
//#define RESOURCES "../../Resources/"
// -- relative when using make Makefile
#define RESOURCES "Resources/"
#elif _WIN32
// -- running from .exe
//#define RESOURCES "..\\Asteroid_Game\\Resources\\"
// -- running in IDE
#define RESOURCES "Resources\\"
#else // Linux
#define RESOURCES "Resources/"
#endif