/*
 *  loadTGA.h
 *  Advanced2D
 *
 *  Created by Ralph Smith on 7/13/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#include "Advanced2D.h"

#ifndef LOAD_TGA_H_INCLUDED
#define LOAD_TGA_H_INCLUDED

namespace Advanced2D {

	typedef	struct									
	{
		GLubyte	*imageData;		// Image Data (Up To 32 Bits)
		GLuint	bpp;			// Image Color Depth In Bits Per Pixel
		GLuint	width;			// Image Width
		GLuint	height;			// Image Height
		GLuint	texID;			// Texture ID Used To Select A Texture
		GLuint	type;			// Image Type (GL_RGB, GL_RGBA)
	} TextureImage;	
	
	
	typedef struct
	{
		GLubyte Header[12];		// TGA File Header
	} TGAHeader;
	
	
	typedef struct
	{
		GLubyte		header[6];		// First 6 Useful Bytes From The Header
		GLuint		bytesPerPixel;	// Holds Number Of Bytes Per Pixel Used In The TGA File
		GLuint		imageSize;		// Used To Store The Image Size When Setting Aside Ram
		GLuint		type;	
		GLuint		Height;			//Height of Image
		GLuint		Width;			//Width ofImage
		GLuint		Bpp;			// Bits Per Pixel
	} TGAImage;
	
	bool LoadTGA(TextureImage *texture, char *filename);
	
};
#endif