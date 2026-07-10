/*
 *  Texture.h
 *  Advanced2D
 *
 *  Created by Ralph Smith on 7/10/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#include "Advanced2D.h"

#ifndef __TEXTURE_H__
#define __TEXTURE_H__

namespace Advanced2D {
	
	//CONSTANTS:
	typedef enum {
		kTexture2DPixelFormat_Automatic = 0,
		kTexture2DPixelFormat_RGBA8888,
		kTexture2DPixelFormat_RGB565,
		kTexture2DPixelFormat_A8,
		kTexture2DPixelFormat_RGB,
	} Texture2DPixelFormat;

	typedef enum {
		BMP,
		TGA,
	} TextureType;

	class Texture
	{
	public:
		Texture();
		Texture (std::string filename, TextureType type=TGA, GLenum filter=GL_LINEAR);
		~Texture();
		
		Texture2DPixelFormat pixelFormat() {return _format;}
		unsigned long pixelsWide() {return _width;}
		unsigned long pixelsHigh() {return _height;}
		GLuint name() {return _name;}
		GSize contentSize() {return _size;}
		GLfloat maxS() {return _maxS;}
		GLfloat maxT() {return _maxT;}
		
		// -- wrappers for book capatability
		int getWidth() {return _width;}
		int getHeight() {return _height;}
		void Release() {} // -- remove texture from OpenGL
		
		std::string description();
		GLuint loadBMPTexture (std::string filename, GLenum filter=GL_LINEAR);
		GLuint loadTGATexture (std::string filename, GLenum filter=GL_LINEAR);
		
		void drawAtPoint (GPoint point, float alpha);
		
	protected:
		
	private:
		GLuint					_name;
		GSize					_size;
		unsigned long			_width,
								_height;
		Texture2DPixelFormat	_format;
		GLfloat					_maxS,
								_maxT;
		
		void initWithData (const void* data, Texture2DPixelFormat pixelFormat, 
						   unsigned long width, unsigned long height, GSize size, GLenum filter);
		
	};
	
};

#endif
