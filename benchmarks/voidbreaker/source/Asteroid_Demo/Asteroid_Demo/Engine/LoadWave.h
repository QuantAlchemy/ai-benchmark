/*
 *  LoadWave.h
 *  Advanced2D
 *
 *  Created by Ralph Smith on 8/3/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#ifndef __LOAD_WAVE_H__
#define __LOAD_WAVE_H__

#include <stdio.h>
#include <stdlib.h>
#include <string>
#include <string.h>		// needed for memcpy()

#if _WIN32
#pragma comment(lib, "wsock32.lib") // needed for htonl() on windows
#else
#include <arpa/inet.h>	// needed for htonl() on linux/mac
#endif

#include "MMapper.h"

struct format {
	short compression;
	short channels;
	int sampleRate;
	int BPS;
	short blockAlign;
	short sigBitsPerSample;
	int extraFormatBytes;
};

#define DATA_CHUNK 0x64617461
#define FMT_CHUNK 0x666D7420

bool LoadWave (std::string wavFile, void** data, int* in_size, int* format, int* freq)
{
	printf("\n\nloading %s\n", wavFile.c_str());
//#if _WIN32
//	char buff[256];
//	getcwd(buff, 256);
//	printf("current working directory: %s\n", buff);
//#endif
	void* p;
	unsigned long len;
	MMapper Map(wavFile, "rb", &p, &len);
	
	if (len < 1) {
		printf ("error opening %s\n", wavFile.c_str());
		return false;
	}
	
	p=(char*)p+12; // skip the initial header
	int chunkType = 0;
	int size = 0;
	
	struct format fmt;
	
	while (chunkType != DATA_CHUNK) {
		memcpy (&chunkType, p, 4);
		chunkType = htonl (chunkType);
		
		if (chunkType == FMT_CHUNK) {
			printf ("Format chunk data:\n");
			
			p=(char*)p+4;
			memcpy (&size, p, 4);
			printf ("\tChunk Size: %d\n", size);
			if (size != 16) {
				// chunk size is 16 for PCM
				printf("\tERROR: chunck size != 16 (PCM)\n");
				(*data) = NULL;
				return false;
			}
			
			p=(char*)p+4;
			memcpy (&fmt.compression, p, 2);
			printf ("\tCompression: %d\n", fmt.compression);
			if (fmt.compression != 1) {
				// format is 1 for PCM
				printf("\tERROR: format != 1 (PCM)\n");
				(*data) = NULL;
				return false;
			}
			
			p=(char*)p+2;
			memcpy (&fmt.channels, p, 2);
			printf ("\tChannels: %d\n", fmt.channels);
			
			p=(char*)p+2;
			memcpy (&fmt.sampleRate, p, 4);
			printf ("\tSample Rate: %d\n", fmt.sampleRate);
			
			p=(char*)p+4;
			memcpy (&fmt.BPS, p, 4);
			printf ("\tBytes Per Second: %d\n", fmt.BPS);
			
			p=(char*)p+4;
			memcpy (&fmt.blockAlign, p, 2);
			printf ("\tBlock Align: %d\n", fmt.blockAlign);
			
			p=(char*)p+2;
			memcpy (&fmt.sigBitsPerSample, p, 2);
			printf ("\tSignificant BPS: %d\n", fmt.sigBitsPerSample);
			
			p=(char*)p+2;
			/*			
			 if (fmt.compression > 1) {
			 memcpy (&fmt.extraFormatBytes, p, 4);
			 p=(char*)p+2+fmt.extraFormatBytes;
			 printf ("\tExtra format bytes: %x\n", fmt.extraFormatBytes);
			 }
			 */		
		}
		if (chunkType == DATA_CHUNK) {
			printf ("in data chunk ...\n");
			p=(char*)p+4;
			memcpy (&size, p, 4);
			printf ("Data chunk size: %d\n", size);
			p=(char*)p+4;
			break;
		}
	}
		
	// we have the data at this point so lets pack it
	(*data) = malloc(size);
	memcpy ((*data), p, size);
	(*freq) = fmt.sampleRate;
	(*in_size) = size;
	switch (fmt.channels)
	{
		case 1:
		{
			// mono
			(*format) = (fmt.sigBitsPerSample == 8) ? AL_FORMAT_MONO8 : AL_FORMAT_MONO16;
		} break;
		case 2:
		{
			// stereo
			(*format) = (fmt.sigBitsPerSample == 8) ? AL_FORMAT_STEREO8 : AL_FORMAT_STEREO16;
		} break;
	}
	
	int samples;
	if (fmt.sigBitsPerSample == 8) {
		samples = size/sizeof(char);
	}
	else {
		samples = size/sizeof(short);
	}
	
	if (fmt.channels == 2) {
		samples /= 2;
	}
	printf ("Total Samples: %d\n", samples);
	
	return true;
	
}


void UnloadWave (void* data)
{
	if (data != NULL) {
		std::cout << "data " << data << std::endl;
		free(data);
	}
}


#endif