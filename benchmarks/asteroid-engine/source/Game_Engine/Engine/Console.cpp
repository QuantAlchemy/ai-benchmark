/*
 *  Console.cpp
 *  Advanced2D
 *
 *  Created by Ralph Smith on 8/9/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#include "Console.h"
#include "../Resources.h"

namespace Advanced2D {

	Console::Console() 
	{
		showing = false;
		currentLine = 0;
		clear();
	}

	Console::~Console() 
	{
		delete font;
		delete panel;
	}

	bool Console::init()
	{
		//load the panel image
		panel = new Sprite();
		if (!panel->loadImage(RESOURCES"/panel.tga")) return false;
		double scale = g_engine->getScreenWidth() / 640.0f;
		panel->setScale(scale);
		panel->setColor(1.0, 1.0, 1.0, 0.75);
		panel->setPosition(g_engine->getScreenWidth()/2, g_engine->getScreenHeight()-((panel->getHeight()/2)*scale));
		
		//load the font
		font = new Font();
		if (!font->loadImage(RESOURCES"/verdana10.tga")) return false;
		font->setColumns(16);
		font->setCharSize(20,16);
		if (!font->loadWidthData(RESOURCES"/verdana10.dat")) return false;
		
		return true;
	}

	void Console::draw()
	{
		int x = 15;
		int y = g_engine->getScreenHeight()-25;
		int lineSpacing = 13;
		
		if (!showing) return;
		
		panel->draw();
		sharedSpriteBatcher.end();
		
		for (unsigned int n = 0; n < textlines.size(); n++)
		{
			font->Print(x,y, textlines[n], Color4fMake(0.0, 0.0, 0.0, 1.0));
			y -= lineSpacing;
			
			// print 26 lines per coloumn
			if (y < g_engine->getScreenHeight()-25 - (26*lineSpacing)) {
				if (x > 15) break;
				x = g_engine->getScreenWidth()/2 + 15;
				y = g_engine->getScreenHeight()-25;
			}
		}
	}

	void Console::print(std::string text, int line)
	{
		if (line > -1) currentLine = line;
		textlines[currentLine] = text;
		if (currentLine++ > 52) currentLine = 0;
	}

	void Console::clear()
	{
		for (int n=0; n<55; n++)
			textlines.push_back("");
	}
	
};