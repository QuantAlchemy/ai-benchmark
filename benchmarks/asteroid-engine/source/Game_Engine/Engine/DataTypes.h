/*
 *  DataTypes.h
 *  Advanced2D
 *
 *  Created by Ralph Smith on 6/20/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#ifndef __DATA_TYPES_H__
#define __DATA_TYPES_H__

/* Points. */
typedef struct _CGPoint {
	float x;
	float y;
} GPoint;

/* Sizes. */
typedef struct _CGSize {
	float width;
	float height;
} GSize;

/* Rectangles. */
typedef struct _CGRect {
	GPoint origin;
	GSize size;
} GRect;

inline GPoint GPointMake(float x, float y)
{
	GPoint p; p.x = x; p.y = y; return p;
}

inline GSize GSizeMake(float width, float height)
{
	GSize size; size.width = width; size.height = height; return size;
}

inline GRect GRectMake(float x, float y, float width, float height)
{
	GRect rect;
	rect.origin.x = x; rect.origin.y = y;
	rect.size.width = width; rect.size.height = height;
	return rect;
}

typedef struct _Quad2f {
	GLfloat bl_x, bl_y;
	GLfloat br_x, br_y;
	GLfloat tl_x, tl_y;
	GLfloat tr_x, tr_y;
} Quad2f;

typedef struct _Color4f {
	GLfloat red;
	GLfloat green;
	GLfloat blue;
	GLfloat alpha;
} Color4f;

inline Color4f ColorNull ()
{
	Color4f color;
	color.red = 1.0;
	color.green = 1.0;
	color.blue = 1.0;
	color.alpha = 1.0;
	return color;
}

inline Color4f Color4fMake(GLfloat red, GLfloat green, GLfloat blue, GLfloat alpha)
{
	Color4f color; color.red=red; color.green=green; color.blue=blue; color.alpha=alpha;
	return color;
}

#endif
