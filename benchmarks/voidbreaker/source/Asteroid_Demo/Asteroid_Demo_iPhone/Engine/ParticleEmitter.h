/*
 *  ParticleEmitter.h
 *  Advanced2D
 *
 *  Created by Ralph Smith on 7/25/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#include <vector>

#include "Advanced2D.h"

#ifndef __PARTICLE_EMITTER_H__
#define __PARTICLE_EMITTER_H__

namespace Advanced2D {

	class ParticleEmitter {
	
	private:
		typedef std::vector<Sprite*>::iterator iter;
		std::vector<Sprite*> particles;
		Texture *image;
		Vector3 position;
		double direction;
		double length;
		int max;
		int alphaMin,alphaMax;
		int minR,minG,minB,maxR,maxG,maxB;
		int spread;
		double velocity;
		double scale;
		int lifetime;

	public:
		ParticleEmitter();
		virtual ~ParticleEmitter();
		bool loadImage(std::string filename, TextureType type=TGA, GLenum filter=GL_LINEAR);
		void draw();
		void update(int ms = 5);
		void add();
		
		void setPosition(double x, double y) { position.Set(x,y,0); }
		void setPosition(Vector3 vec) { position = vec; }
		Vector3 getPosition() { return position; }
		void setDirection(double angle) { direction = angle; }
		double getDirection() { return direction; }
		void setMax(int num) { max = num; }
		void setAlphaRange(int min, int max);
		void setColorRange(int r1, int g1, int b1, int r2, int g2, int b2);
		void setSpread(int value) { spread = value; }
		void setLength(double value) { length = value; }
		void setVelocity(double value) { velocity = value; }
		void setScale(double value) { scale = value; }
		void setLifetime(int ms);

	};//class

};

#endif
