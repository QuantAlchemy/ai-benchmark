/*
 *  SoundManager.cpp
 *  Advanced2D
 *
 *  Created by Ralph Smith on 8/3/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#include <cassert>
#include "SoundManager.h"
#include "LoadWave.h"

// Define the number of sources which will be created.  iPhone can have a max of 32
#define MAX_OPENAL_SOURCES 32

SoundManager::SoundManager()
{
	// Set up the OpenAL.  If an error occurs then nil will be returned.
	bool success = initOpenAL();
	if (!success) {
		printf ("ERROR - SoundManager: Error initializing OpenAL\n");
		assert (success);
	}
	
	// Set up the listener position
	ALfloat listener_pos[] = {0, 0, 0};
	ALfloat listener_ori[] = {0.0, 1.0, 0.0, 0.0, 0.0, 1.0};
	ALfloat listener_vel[] = {0, 0, 0};
	
	alListenerfv(AL_POSITION, listener_pos);
	alListenerfv(AL_ORIENTATION, listener_ori);
	alListenerfv(AL_VELOCITY, listener_vel);
	
	// Set the default volume for music and sound FX
	this->musicVolume = 1.0f;
	this->FXVolume = 1.0f;
}


SoundManager::~SoundManager()
{
	std::map<std::string, Sound*>::iterator it;
	for (it=soundLibrary.begin(); it != soundLibrary.end(); ++it) 
	{
		delete it->second;
	}
	
	this->context=alcGetCurrentContext();
	this->device=alcGetContextsDevice(this->context);
	alcMakeContextCurrent(NULL);
	alcDestroyContext(this->context);
	alcCloseDevice(this->device);
}


bool SoundManager::initOpenAL()
{
	if (DEBUG) printf ("INFO - Sound Manager: Initializing sound manager\n");
	
	this->device = alcOpenDevice(NULL);
	if (this->device) {
		this->context = alcCreateContext(this->device, NULL);
		alcMakeContextCurrent(this->context);
		// Set the distance model to be used
		alDistanceModel(AL_LINEAR_DISTANCE_CLAMPED);
		
		// Pre-create 32 sound sources which can be dynamically allocated to buffers (sounds)
//		ALuint sourceID;
//		for (int index = 0; index < MAX_OPENAL_SOURCES; index++) {
//			// Generate an OpenAL source
//			alGenSources(1, &sourceID);
//            
//            // Configure the generated source so that sounds fade as the player moves
//            // away from them
//            alSourcef(sourceID, AL_REFERENCE_DISTANCE, 50.0F);
//            alSourcef(sourceID, AL_MAX_DISTANCE, 250.0f);
//            alSourcef(sourceID, AL_ROLLOFF_FACTOR, 25.0f);
//            
//            if (DEBUG) printf ("INFO - Sound Manager: Generated source id '%d'\n", sourceID);
//            
//			// Add the generated sourceID to our array of sound sources
//			this->soundSources.push_back (sourceID);
//		}
        
        if (DEBUG) printf ("INFO - Sound Manager: Finished initializing the sound manager\n");
		// Return YES as we have successfully initialized OpenAL
		return true;
	}
	
	// We were unable to obtain a device for playing sound so tell the user and return NO.
    if(DEBUG) printf ("ERROR - SoundManager: Unable to allocate a device for sound.\n");
	return false;
}


// return new source
ALuint SoundManager::GetAvailableSource()
{
	ALuint sourceID;
	// Generate an OpenAL source
	alGenSources(1, &sourceID);
	
	// Configure the generated source so that sounds fade as the player moves
	// away from them
	alSourcef(sourceID, AL_REFERENCE_DISTANCE, 50.0F);
	alSourcef(sourceID, AL_MAX_DISTANCE, 250.0f);
	alSourcef(sourceID, AL_ROLLOFF_FACTOR, 25.0f);
	
	if (DEBUG) printf ("INFO - Sound Manager: Generated source id '%d'\n", sourceID);
	
	// Add the generated sourceID to our array of sound sources
	return sourceID;
}


void SoundManager::SetActivated (bool state)
{
	if (state) {
		if(DEBUG) printf ("INFO - SoundManager: OpenAL Active\n");
		// As we are finishing the interruption we need to bind back to our context.
        alcMakeContextCurrent(this->context);
	}
	else {
		if(DEBUG) printf ("INFO - SoundManager: OpenAL Inactive\n");
        
        // As we are being interrupted we set the current context to NULL.  If this sound manager is to be
        // compaitble with firmware prior to 3.0 then the context would need to also be destroyed and
        // then re-created when the interruption ended.
        alcMakeContextCurrent(NULL);
	}
}


// returns a Sound struct
Sound* SoundManager::FindSound(std::string aKey)
{
	static std::map<std::string, Sound*>::iterator it;
	it = this->soundLibrary.find (aKey);
	if (it == this->soundLibrary.end()) {return (Sound*)0;}
	return it->second;
}


bool SoundManager::LoadSound (std::string aKey, std::string aFileName, SoundType type)
{
    ALuint bufferID;
	
	// Generate a buffer within OpenAL for this sound
	alGenBuffers(1, &bufferID);
    
    // Set up the variables which are going to be used to hold the format
    // size and frequency of the sound file we are loading
	ALenum	error = AL_NO_ERROR;
	ALenum	format;
	ALsizei	size;
	ALsizei	freq;
	ALvoid*	data;
	
	// Get the audio data from the file which has been passed in
	bool success = LoadWave (aFileName, &data, &size, &format, &freq);
	
	if (!success)
	{
		printf("ERROR - SoundManager: Could not load file %s\n", aFileName.c_str());
		UnloadWave(data);
		return false;
	}
	
	if((error = alGetError()) != AL_NO_ERROR) {
		printf("ERROR - SoundManager: Error loading sound: %x\n", error);
		//exit(1);
		UnloadWave(data);
		return false;
	}
	
	// Use the static buffer data API
	// alBufferDataStaticProc(bufferID, format, data, size, freq);
	alBufferData(bufferID, format, data, size, freq);
	
	if((error = alGetError()) != AL_NO_ERROR) {
		printf("ERROR - SoundManager: Error attaching audio to buffer: %x\n", error);
		UnloadWave(data);
		return false;
	}
	UnloadWave(data);
	
	// Place the sound into the sound library against |aKey|
	Sound* sound = new Sound;
	sound->type = type;
	sound->buffer = bufferID;
	sound->source = GetAvailableSource();
	soundLibrary.insert( std::map<std::string, Sound*>::value_type(aKey, sound) );
	return true;
}


bool SoundManager::Play (std::string aKey, bool aLoop)
{
	Sound* sound = FindSound(aKey);
	if (sound == 0) {return false;}
	
	return Play(sound, aLoop);
}


bool SoundManager::Play (std::string aKey, ALfloat aGain, ALfloat aPitch, Vector2 aLocation, bool aLoop)
{
	Sound* sound = FindSound(aKey);
	if (sound == 0) {return false;}
    
	sound->gain = aGain;
	sound->pitch = aPitch;
	sound->location = aLocation;
	
	// Return the sourceID so that loops can be stopped etc
	return Play(sound, aLoop);
}


bool SoundManager::Play (Sound* aSound, bool aLoop)
{
	// only play the sound if it isn't already playing
//	if (IsPlaying(aSound)) {
//		if(DEBUG) printf("Sound is already playing\n");
//		return true;
//	}
	
	this->err = alGetError(); // clear the error code
	
	ALuint aSourceID = aSound->source;
	ALuint aBufferID = aSound->buffer;
	ALfloat aGain = aSound->gain;
	ALfloat aPitch = aSound->pitch;
	Vector2 aLocation = aSound->location;
	ALfloat volume;
	
	// Make sure that the source is clean by resetting the buffer assigned to the source to 0
	alSourcei(aSourceID, AL_BUFFER, 0);
	
	// Attach the buffer we have looked up to the source we have just found
	alSourcei(aSourceID, AL_BUFFER, aBufferID);
	
	// Set the pitch and gain of the source
	alSourcef(aSourceID, AL_PITCH, aPitch);
	switch (aSound->type) {
		case kFX:
			volume = this->FXVolume;
			break;
		case kMUSIC:
			volume = this->musicVolume;
			break;
		default:
			break;
	}
	alSourcef(aSourceID, AL_GAIN, aGain * volume);
	
	// Set the looping value
	if (aLoop) {
		alSourcei(aSourceID, AL_LOOPING, AL_TRUE);
	} else {
		alSourcei(aSourceID, AL_LOOPING, AL_FALSE);
	}
	
	// Set the source location
	alSource3f(aSourceID, AL_POSITION, aLocation.x, aLocation.y, 0.0f);
	
	// Now play the sound
	alSourcePlay(aSourceID);
    this->err = alGetError();
	
    // Check to see if there were any errors
	this->err = alGetError();
	if (this->err != 0) {
		if(DEBUG) printf("ERROR - SoundManager: %d\n", this->err);
			return false;
	}

	return true;
}


bool SoundManager::Stop (std::string aKey)
{
	this->err = alGetError(); // clear the error code
	
	Sound* sound = FindSound(aKey);
	if (sound == 0) {return false;}
	
	ALuint aSoundID = sound->source;
	
	// Now stop the sound
	alSourceStop(aSoundID);
    this->err = alGetError();
	
    // Check to see if there were any errors
	this->err = alGetError();
	if (this->err != 0) {
		if(DEBUG) printf("ERROR - SoundManager: %d\n", this->err);
		return false;
	}
	
	return true;
}


bool SoundManager::Pause (std::string aKey)
{
	this->err = alGetError(); // clear the error code
	
	Sound* sound = FindSound(aKey);
	if (sound == 0) {return false;}
	
	ALuint aSoundID = sound->source;
	
	// Now pause the sound
	alSourcePause(aSoundID);
    this->err = alGetError();
	
    // Check to see if there were any errors
	this->err = alGetError();
	if (this->err != 0) {
		if(DEBUG) printf("ERROR - SoundManager: %d\n", this->err);
		return false;
	}
	
	return true;
}


void SoundManager::StopAll()
{
	static std::map<std::string, Sound*>::iterator it;
	for (it=soundLibrary.begin(); it != soundLibrary.end(); ++it) 
	{
		ALuint aSoundID = it->second->source;
		// Now stop the sound
		alSourceStop(aSoundID);
		this->err = alGetError();
		
		// Check to see if there were any errors
		this->err = alGetError();
		if (this->err != 0) {
			if(DEBUG) printf("ERROR - SoundManager: %d\n", this->err);
			continue;
		}
	}
}


void SoundManager::StopAllExcept (std::string aKey)
{
	static std::map<std::string, Sound*>::iterator it;
	for (it=soundLibrary.begin(); it != soundLibrary.end(); ++it) 
	{
		if (it->first == aKey) {
			// don't stop this source
			continue;
		}
		ALuint aSoundID = it->second->source;
		// Now stop the sound
		alSourceStop(aSoundID);
		this->err = alGetError();
		
		// Check to see if there were any errors
		this->err = alGetError();
		if (this->err != 0) {
			if(DEBUG) printf("ERROR - SoundManager: %d\n", this->err);
			continue;
		}
	}
}


bool SoundManager::IsPlaying (Sound* aSound)
{
	int sourceState;
	alGetSourcei(aSound->source, AL_SOURCE_STATE, &sourceState);
	
	// Is this source playing
	return (sourceState == AL_PLAYING) ? true : false;
}


bool SoundManager::IsPlaying (std::string aKey)
{
	Sound* sound = FindSound(aKey);
	if (sound == 0) {return false;}

	int sourceState;
	alGetSourcei(sound->source, AL_SOURCE_STATE, &sourceState);
	
	// Is this source playing
	return (sound->source == AL_PLAYING) ? true : false;
}


bool SoundManager::SoundExists (std::string aKey)
{
	if (FindSound(aKey) == 0) {return false;}
	
	return true;
}


void SoundManager::SetListenerPosition (Vector2 pos)
{
	this->listenerPosition = pos;
	alListener3f (AL_POSITION, pos.x, pos.y, 0.0f);	
}


void SoundManager::SetOrientation (Vector2 pos)
{
	ALfloat orientation[] = {pos.x, pos.y, 0.0f, 0.0f, 0.0f, 1.0f};
    alListenerfv (AL_ORIENTATION, orientation);
}
