// Advanced2D Engine
// Main header file
/*
 *  Advanced2D.h
 *  Advanced2D
 *
 *  Created by Ralph Smith on 6/20/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#ifndef __ADVANCED2D_H__
#define __ADVANCED2D_H__

#include <iostream>
#include <string>
#include <list>
#include <math.h>
#include <stdio.h>

// OpenGL stuff
#if __IPHONE_OS_VERSION_MIN_REQUIRED
#include <OpenGLES/ES1/gl.h>
#include <OpenGLES/ES1/glext.h>
//#include <OpenGLES/ES2/gl.h>
//#include <OpenGLES/ES2/glext.h>
#elif __APPLE__
#include <OpenGL/OpenGL.h>
#elif _WIN32
#include <GL/glut.h>
#else
#include <GL/gl.h>
#include <GL/glu.h>
#endif

#include "DataTypes.h"

// Advanced2d namespace products
#include "common.h"
#include "Timer.h"
#include "Vector2.h"
#include "Vector3.h"
#include "Vector4.h"
#include "Matrix.h"
#include "Quaternion.h"
#include "math_extras.h"
#include "Rect.h"
#include "Texture.h"
#include "ResourceManager.h"
#include "SpriteBatch.h"
#include "Entity.h"
#include "Sprite.h"
#include "PackedSpriteSheet.h"
#include "ParticleEmitter.h"
#include "SoundManager.h"
#include "Font.h"
#include "Rect.h"
#include "Math.h"
#include "Console.h"

#define VERSION_MAJOR 1
#define VERSION_MINOR 0
#define REVISION 0

//external variables and functions
extern bool gameover;

extern bool game_preload();
extern bool game_init();
extern void game_input(unsigned char key, int x, int y);
extern void game_update();
extern void game_end();
extern void game_render3d();
extern void game_render2d();
extern void game_entityUpdate(Advanced2D::Entity* entity);
extern void game_entityRender(Advanced2D::Entity* entity);
extern void game_entityCollision(Advanced2D::Entity* entity1,Advanced2D::Entity* entity2);

namespace Advanced2D 
{
	class Engine {
	private:
		int p_versionMajor, p_versionMinor, p_revision;
//		HWND p_windowHandle;
//		LPDIRECT3D9 p_d3d;
//		LPDIRECT3DDEVICE9 p_device;
//		LPDIRECT3DSURFACE9 p_backbuffer;
//		LPD3DXSPRITE p_sprite_handler;
		std::string	p_apptitle;
		bool p_fullscreen;
		int	p_screenwidth;
		int p_screenheight;
		int p_colordepth;
		bool p_pauseMode;
		Color4f p_ambientColor;
		bool p_maximizeProcessor;
		Timer p_coreTimer;
		long p_frameCount_core;
		long p_frameRate_core;
		Timer p_realTimer;
		long p_frameCount_real;
		long p_frameRate_real;
		Timer timedUpdate;
		Timer collisionTimer;

		void UpdateEntities();
		void Draw2DEntities();
		void Draw3DEntities();
		void BuryEntities();
		
		bool collisionBR(Sprite *sprite1, Sprite *sprite2);
		bool collisionD(Sprite *sprite1, Sprite *sprite2);
		void TestForCollisions();
		
		std::list<Entity*> p_entities;
		
	public:
		Engine();
		virtual ~Engine();
		int Init(int width, int height, int colordepth, bool fullscreen);
		void Close();
		void Update();
		void message(std::string message, std::string title = "ADVANCED 2D");
		void fatalerror(std::string message, std::string title = "FATAL ERROR");
		void Shutdown();
		void ClearScene(Color4f color);
		void SetAmbient(Color4f colorvalue);
		int RenderStart();
		int RenderStop();
		int Render2D_Start();
		int Render2D_Stop();
		int Release();
		
		//public Math object
		Math *math;

		//accessor/mutator functions expose the private variables
		bool isPaused() { return this->p_pauseMode; }
		void setPaused(bool value) { this->p_pauseMode = value; }
		
//		LPDIRECT3DDEVICE9 getDevice() { return this->p_device; }
//		LPDIRECT3DSURFACE9 getBackBuffer() { return this->p_backbuffer; }
//		LPD3DXSPRITE getSpriteHandler() { return this->p_sprite_handler; }
		
//		void setWindowHandle(HWND hwnd) { this->p_windowHandle = hwnd; }
//		HWND getWindowHandle() { return this->p_windowHandle; }
		
		std::string getAppTitle() { return this->p_apptitle; }
		void setAppTitle(std::string value) { this->p_apptitle = value; }
		int getVersionMajor() { return this->p_versionMajor; }
		int getVersionMinor() { return this->p_versionMinor; }
		int getRevision() { return this->p_revision; }
		std::string getVersionText();
		
		long getFrameRate_core() { return this->p_frameRate_core; };
		long getFrameRate_real() { return this->p_frameRate_real; };
		
		int getScreenWidth() { return this->p_screenwidth; }
		void setScreenWidth(int value) { this->p_screenwidth = value; }
		int getScreenHeight() { return this->p_screenheight; }
		void setScreenHeight(int value) { this->p_screenheight = value; }
		
		int getColorDepth() { return this->p_colordepth; }
		void setColorDepth(int value) { this->p_colordepth = value; }
		
		bool getFullscreen() { return this->p_fullscreen; }
		void setFullscreen(bool value) { this->p_fullscreen = value; }
		
		bool getMaximizeProcessor() { return this->p_maximizeProcessor; }
		void setMaximizeProcessor(bool value) { this->p_maximizeProcessor = value; }
		
		std::list<Entity*> getEntityList() { return p_entities; }
		long getEntityCount() { return (long)p_entities.size(); }
		void addEntity(Entity *entity);
		Entity *findEntity(std::string name);
		Entity *findEntity(int objectType);
		bool entityExists(int objectType);
		int getEntityCount(int objectType);
		
		//moved this to public so it's visible
		bool collision(Sprite *sprite1, Sprite *sprite2);
		
		void test() {printf("it worked\n");}
		
	}; //class


}; //namespace

 
//define the global engine object (visible everywhere!)
extern Advanced2D::Engine *g_engine;

#endif

