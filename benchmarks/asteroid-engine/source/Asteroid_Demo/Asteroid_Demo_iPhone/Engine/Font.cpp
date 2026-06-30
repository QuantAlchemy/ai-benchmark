/*
 *  Font.cpp
 *  Advanced2D
 *
 *  Created by Ralph Smith on 8/7/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#include <string.h>
#include <fstream>

#include "Font.h"

namespace Advanced2D {

	Font::Font() : Sprite()
	{
		//set character widths to default
		memset(&widths, 0, sizeof(widths));
		
		//because where using 256 ascii we'll set the total frames to match
		this->setTotalFrames(ASCII_CHAR_SET_LENGTH);
	}
	
	void Font::Print(int x, int y, std::string text, Color4f color)
	{ 
		double fx = x;
		double fy = y;
		
		//set font color
		this->setColor(color.red, color.green, color.blue, color.alpha);
		
		//draw each character of the string
	    for (unsigned int n=0; n<text.length(); n++)
	    {
			int frame = (int)text[n];
			this->setCurrentFrame( frame );
			this->setX( fx );
			this->setY( fy );
			this->draw(false); // we don't want to center text when it is drawn

			//use proportional width if available
			if (widths[frame] == 0) widths[frame] = this->width;
			fx += widths[frame] * this->scaling;
	    }
	}
	
	bool Font::loadWidthData(std::string filename)
	{
		unsigned char buffer[ASCII_CHAR_SET_LENGTH * 2];
		
		//open font width data file
		std::ifstream infile;
		infile.open(filename.c_str(), std::ios::binary);
		if (!infile) return false;
		
		//read 512 bytes (2 bytes per character)
		infile.read( (char *)(&buffer), ASCII_CHAR_SET_LENGTH * 2 );
		if (infile.bad()) return false;
		infile.close();        
		
		//convert raw data to proportional width data
		for (int n=0; n < ASCII_CHAR_SET_LENGTH; n++) {
			widths[n] = (int)buffer[n*2];
		}
		
		return true;
	}
	
};
