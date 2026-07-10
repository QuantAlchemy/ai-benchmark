/*
 *  SoundManager.h
 *  Advanced2D
 *
 *  Created by Ralph Smith on 8/3/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#include "Advanced2D.h"

#ifndef __SOUND_MANAGER_H__
#define __SOUND_MANAGER_H__

#include <map>
#include <string>
#include <vector>

#if __APPLE__ // -- mac && iphone
#include <OpenAL/al.h>
#include <OpenAL/alc.h>
#elif _WIN32
#include <AL/al.h>
#include <AL/alc.h>
#pragma comment( lib, "OpenAL32.lib" )
#else
#include <AL/al.h>
#include <AL/alut.h>
#endif


namespace Advanced2D {
	
	enum SoundType {
		kFX,
		kMUSIC
	};
	
	struct Sound {
		ALuint		buffer;		// the sound buffer *the noise*
		ALuint		source;		// the sound source
								// the buffer plays in the source
		ALfloat		gain;
		ALfloat		pitch;
		
		Vector2		location;
		SoundType	type;
		
		Sound() {buffer=source=0; gain=0.5; pitch=1.0; type=kFX;}
	};
	
	class SoundManager
	{
	private:
		ALCcontext			*context;
		ALCdevice			*device;
		
		std::map<std::string, Sound*>	soundLibrary;
		
		ALfloat				musicVolume;
		ALfloat				FXVolume;
		Vector2				listenerPosition;
		ALenum				err;
		
		bool initOpenAL();
		ALuint NextAvailableSource();
		ALuint GetAvailableSource();
		void SetActivated (bool state);
		
	protected:
		SoundManager (void);
		SoundManager (const SoundManager&) {}
		SoundManager& operator= (const SoundManager&) {return *this;}
		~SoundManager();
		
	public:
		static inline SoundManager& Instance()
		{
			static SoundManager inst;
			return inst;
		}
		
		Sound* FindSound (std::string aKey);
		bool LoadSound (std::string aKey, std::string aFileName, SoundType type=kFX);
		// TO DO: Add UnloadSound function
		bool Play (std::string aKey, bool aLoop=false);
		bool Play (std::string aKey, ALfloat aGain, ALfloat aPitch, Vector2 aLocation, bool aLoop);
		bool Play (Sound* aSound, bool aLoop=false);
		
		bool Stop (std::string aKey);
		bool Pause (std::string aKey);
		void StopAll();
		void StopAllExcept (std::string aKey);
		
		bool IsPlaying (Sound* aSound);
		bool IsPlaying (std::string aKey);
		bool SoundExists (std::string aKey);
		
		void ShutdownSoundManager();
		
		void SetMusicVolume (ALfloat volume) {musicVolume = volume;}
		void SetFXVolume (ALfloat volume) {FXVolume = volume;}
		ALfloat GetMusicVolume() {return musicVolume;}
		ALfloat GetFXVolume() {return FXVolume;}
		
		void SetListenerPosition (Vector2 pos);
		void SetOrientation (Vector2 pos);
		
	};
	
#define sharedSoundManager SoundManager::Instance()
	
};

#endif
