/*
 *  Sprite.h
 *  Advanced2D
 *
 *  Created by Ralph Smith on 8/3/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#include "Advanced2D.h"

#ifndef __SPRITE_H__
#define __SPRITE_H__

namespace Advanced2D {

	enum CollisionType {
		COLLISION_NONE = 0,
		COLLISION_RECT = 1,
		COLLISION_DIST = 2
	};

	class Sprite : public Entity {
	private:
		Vector3 position;
		Vector3 velocity;
		bool imageLoaded;
		int state;
		int direction;
		bool initialized;
		
		float texWidthRatio;
		float texHeightRatio;
		Quad2f *vertices;
		Quad2f *textureCoordinates;
		Quad2f *transformedVerts;
		GLushort *indices;
		GPoint lastTextureOffset, textureOffset;
		
		void calculateVerticesAtPoint (GPoint aPoint, GLuint aSubImageWidth, GLuint aSubImageHeight, bool aCenter);
		void calculateTexCoordsAtOffset (GPoint aOffsetPoint, int aSubImageWidth, int aSubImageHeight);


	protected:
		Texture	*image;
		int		width,height;
		int		animcolumns;
		double	framestart,frametimer;
		double	movestart, movetimer;
		bool	collidable;
		enum CollisionType collisionMethod;
		int		curframe,totalframes,animdir;
		double	faceAngle, moveAngle;
		int		animstartx, animstarty;
		double	rotation, scaling;
		GLfloat colorfilter[4][4];
		Color4f color;
			
	public:
		Sprite();
		virtual ~Sprite();
		void init();
		bool loadImage(std::string filename, TextureType type=TGA, GLenum filter=GL_LINEAR);
		void setImage(Texture *);
		void move();
		void animate();
		void draw(bool aCenter=true);

		Texture* getImage() {return image;}
		Sprite* getSubSprite(GPoint aPoint, int subWidth, int subHeight);
		
		//screen position
		Vector3 getPosition() { return position; }
		void setPosition(Vector3 position) { this->position = position; }
		void setPosition(double x, double y) { position.Set(x,y,0); }
		double getX() { return position.getX(); }
		double getY() { return position.getY(); }
		void setX(double x) { position.setX(x); }
		void setY(double y) { position.setY(y); }

		//movement velocity
		Vector3 getVelocity() { return velocity; }
		void setVelocity(Vector3 v) { this->velocity = v; }
		void setVelocity(double x, double y) { velocity.setX(x); velocity.setY(y); }

		//image size
		void setSize(int width, int height) { this->width = width; this->height = height; }
		int getWidth() { return this->width; }
		void setWidth(int value) { this->width = value; }
		int getHeight() { return this->height; }
		void setHeight(int value) { this->height = value; }
		void setTextureOffset(float x, float y) {textureOffset.x = x; textureOffset.y = y;}

		int getState() { return state; }
		void setState(int value) { state = value; }

		int getDirection() { return direction; }
		void setDirection(int value) { direction = value; }

		int getColumns() { return animcolumns; }
		void setColumns(int value) { animcolumns = value; }

		int getFrameTimer() { return frametimer; }
		void setFrameTimer(int value) { frametimer = value; }

		int getCurrentFrame() { return curframe; }
		void setCurrentFrame(int value) { curframe = value; }

		int getTotalFrames() { return totalframes; }
		void setTotalFrames(int value) { totalframes = value; }

		int getAnimationDirection() { return animdir; }
		void setAnimationDirection(int value) { animdir = value; }

		double getRotation() { return rotation; }
		void setRotation(double value) { rotation = value; }
		double getScale() { return scaling; }
		void setScale(double value) { scaling = value; }

		//modified from original -- new accessor
		Color4f getColor() { return color; }
		void setColor(GLfloat r, GLfloat g, GLfloat b, GLfloat a=1.0) { color.red = r; color.green = g; color.blue = b; color.alpha = a;}
		void setAlpha(GLfloat a) { color.alpha = a;}

		int getMoveTimer() { return movetimer; }
		void setMoveTimer(int value) { movetimer = value; }

		bool isCollidable() { return collidable; }
		void setCollidable(bool value) { collidable = value; }
		CollisionType getCollisionMethod() { return collisionMethod; }
		void setCollisionMethod(CollisionType type) { collisionMethod = type; }
		Rect getBounds();

	}; //class
};


#endif