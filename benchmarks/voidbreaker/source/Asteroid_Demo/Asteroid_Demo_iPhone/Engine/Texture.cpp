/*
 *  Texture.cpp
 *  Advanced2D
 *
 *  Created by Ralph Smith on 7/10/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#include <stdlib.h>
#include <string.h>
#include <sstream>

#ifdef _WIN32
#include <GL/GLee.h>
#endif

#include "Texture.h"
#include "loadBMP.h"
#include "loadTGA.h"

//CONSTANTS:
#define kMaxTextureSize	 1024

namespace Advanced2D {

	Texture::Texture()
	{
		_name = 0;
		_size = GSizeMake(0, 0);
		_width = 0;
		_height = 0;
		_format = kTexture2DPixelFormat_Automatic;
		_maxS = 0;
		_maxT = 0;
	}	

	Texture::Texture(std::string filename, TextureType type, GLenum filter)
	{
		_name = 0;
		_size = GSizeMake(0, 0);
		_width = 0;
		_height = 0;
		_format = kTexture2DPixelFormat_Automatic;
		_maxS = 0;
		_maxT = 0;
		
		switch (type) {
			case BMP:
				loadBMPTexture(filename, filter);
				break;
			case TGA:
				loadTGATexture(filename, filter);
				break;
			default:
				loadTGATexture(filename, filter);
				break;
		}
	}

	Texture::~Texture()
	{
		if(_name)
			glDeleteTextures(1, &_name);
	}


	std::string Texture::description ()
	{
		std::ostringstream oss;
		oss << "This " << this << " Name " << _name << " Orignal size " << _size.width << "x" << _size.height
			<< " Size ^2 padded " << _width << "x" << _height << " Coordinates " << _maxS << " " << _maxT;
		
		return oss.str();
	}


	GLuint Texture::loadBMPTexture (std::string filename, GLenum filter)
	{
		printf("load bmp texture %s\n", filename.c_str());
		
		GSize					imageSize; // holds the image size
		unsigned long			width, height; // holds the padded size of the image to make the image a power of 2
		bool					sizeToFit = false;
		unsigned char*			data;		// hold image pixel data
		unsigned char*			lpBits16;	// array for converting data to RGB565
		unsigned long				i;			// var for getting power of 2 size
	//	Texture2DPixelFormat	pixelFormat = kTexture2DPixelFormat_RGB;
		Texture2DPixelFormat	pixelFormat = kTexture2DPixelFormat_RGB565;

		
		ImageBMP* bmp = loadBMP(filename.c_str());
		
		imageSize.width = bmp->width;
		imageSize.height = bmp->height;

		width = imageSize.width;
		// round up to nearest power of 2
		if((width != 1) && (width & (width - 1))) {
			i = 1;
			while((sizeToFit ? 2 * i : i) < width)
				i *= 2;
			width = i;
		}
		height = imageSize.height;
		// round up to nearest power of 2
		if((height != 1) && (height & (height - 1))) {
			i = 1;
			while((sizeToFit ? 2 * i : i) < height)
				i *= 2;
			height = i;
		}
		// check texture size is within maximum texture size (1024x1024), although if you're loading in textures this big you're going to have memory issues anyway
		while((width > kMaxTextureSize) || (height > kMaxTextureSize)) {
			width /= 2;
			height /= 2;
			imageSize.width *= 0.5;
			imageSize.height *= 0.5;
		}
		
		data = (unsigned char*)malloc(width*height*3);
		
		// init data to zeros i.e. black
		for (unsigned int i=0; i < width*height*3; i++) {
			data[i] = 0x00;		// Red
			data[++i] = 0x00;	// Green
			data[++i] = 0x00;	// Blue
		}
		
		// copy image information to the larger image
		// memcopy is linear so we copy equivalent pixel locations
		for (int i=0; i < imageSize.height; i++) {
			memcpy (&data[i*width*3], &(bmp->pixels[i*(int)imageSize.width*3]), imageSize.width*3);
		}
		// -- This loop could be used in place of the above to swap image data in memory to map to OpenGL coordinates
		//for (int i=imageSize.height-1, j=0; i >= 0; i--, j++) {
			//memcpy (&data[j*width*3], &(bmp->pixels[i*(int)imageSize.width*3]), imageSize.width*3);
		//}
		
		switch (pixelFormat) {
			case kTexture2DPixelFormat_RGB565:
			{
				// convert from RGB (RGB24) to RGB565 (RGB16) fromat
				lpBits16 = (unsigned char*)malloc(width*height*2);
				ColorConversion24To16 (data, width, height, lpBits16);
				free(data);
				data = lpBits16;
			}	break;
			case kTexture2DPixelFormat_RGB:
				// this is the standard .bmp format. Don't due anything.
				break;

			default:
				break;
		}
		
		initWithData(data, pixelFormat, width, height, imageSize, filter);

		delete bmp;
		delete data;

		return _name;
	}

	GLuint Texture::loadTGATexture (std::string filename, GLenum filter)
	{
		printf("load tga texture %s\n", filename.c_str());
		Texture2DPixelFormat pixelFormat = kTexture2DPixelFormat_RGBA8888;
		
		TextureImage *tgaImg = new TextureImage;
		if (!LoadTGA(tgaImg, (char*)filename.c_str()))
		{
			printf("failed to load tga texture\n");
		}

		initWithData(tgaImg->imageData, pixelFormat, tgaImg->width, tgaImg->height, GSizeMake(tgaImg->width, tgaImg->height), filter);

		return _name;		
	}
	
	void Texture::initWithData (const void* data, Texture2DPixelFormat pixelFormat, 
								  unsigned long width, unsigned long height, GSize size, GLenum filter)
	{
		GLint saveName;
		glGenTextures(1, &_name);
		glGetIntegerv(GL_TEXTURE_BINDING_2D, &saveName);
		glBindTexture(GL_TEXTURE_2D, _name);
		glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, filter);
		glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, filter);
		switch(pixelFormat) {
			case kTexture2DPixelFormat_RGBA8888:
				glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, width, height, 0, GL_RGBA, GL_UNSIGNED_BYTE, data);
				break;
			case kTexture2DPixelFormat_RGB565:
				glTexImage2D(GL_TEXTURE_2D, 0, GL_RGB, width, height, 0, GL_RGB, GL_UNSIGNED_SHORT_5_6_5, data);
				break;
			case kTexture2DPixelFormat_A8:
				glTexImage2D(GL_TEXTURE_2D, 0, GL_ALPHA, width, height, 0, GL_ALPHA, GL_UNSIGNED_BYTE, data);
				break;
			case kTexture2DPixelFormat_RGB:
				glTexImage2D(GL_TEXTURE_2D, 0, GL_RGB, width, height, 0, GL_RGB, GL_UNSIGNED_BYTE, data);
				break;
			default:
				printf ("ERROR: pixel fromat not found: %d\n", pixelFormat);
				
		}
		
		glBindTexture(GL_TEXTURE_2D, saveName);
		_size = size;
		_width = width;
		_height = height;
		_format = pixelFormat;
		_maxS = size.width / (float)width;
		_maxT = size.height / (float)height;
		
	}

	void Texture::drawAtPoint (GPoint point, float alpha)
	{
		glColor4f(1.0, 1.0, 1.0, alpha);

		glEnable(GL_BLEND);
		glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
		glEnable(GL_TEXTURE_2D);
		glEnableClientState( GL_VERTEX_ARRAY );				// Disable Vertex Arrays
		glEnableClientState( GL_TEXTURE_COORD_ARRAY );
		
	#if TARGET_OS_IPHONE || TARGET_IPHONE_SIMULATOR
		// flip texture coordinates to map OpenGL coords ((0,0) bottom left) to iPhone coords ((0,0) top left)
		GLfloat		coordinates[] = { 0,	_maxT,	// top left
									_maxS,	_maxT,	// top right
									0,		0,		// bottom left
									_maxS,	0 };	// bottom right
	#else
		// texture coords (0,0) map to window coords (0,0) on all other systems
		GLfloat		coordinates[] = { 0,	0,			// bottom left
									_maxS,	0,			// bottom right
									0,		_maxT,		// top left
									_maxS,	_maxT };	// top right
	#endif
		
		GLfloat		width = (GLfloat)_width * _maxS,
					height = (GLfloat)_height * _maxT;
		
		
		GLfloat		vertices[] = {	-width / 2 + point.x,	-height / 2 + point.y,	0.0,	// bottom left
									width / 2 + point.x,	-height / 2 + point.y,	0.0,	// bottom right
									-width / 2 + point.x,	height / 2 + point.y,	0.0,	// top left
									width / 2 + point.x,	height / 2 + point.y,	0.0 };	// top right

		
		glBindTexture(GL_TEXTURE_2D, _name);
		glVertexPointer(3, GL_FLOAT, 0, vertices);
		glTexCoordPointer(2, GL_FLOAT, 0, coordinates);
		glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
		
		glDisableClientState( GL_VERTEX_ARRAY );				// Disable Vertex Arrays
		glDisableClientState( GL_TEXTURE_COORD_ARRAY );
		glDisable(GL_TEXTURE_2D);
	}
	
}
