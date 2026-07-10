/*
 *  Vector2.h
 *  Advanced2D
 *
 *  Created by Ralph Smith on 7/10/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#include "Advanced2D.h"

#ifndef __VECTOR2_H__
#define __VECTOR2_H__


namespace Advanced2D {
	
	class Vector2 {
	//private:
	public:
		double x, y;
		
	public:
		Vector2();
		Vector2(const Vector2& v);
		Vector2(double x, double y);
		Vector2(int x, int y);
		
		void Set(double x1,double y1);
		void Set(const Vector2& v);
		double getX() { return x; }
		void setX(double v) { x = v; }
		double getY() { return y; }
		void setY(double v) { y = v; }
		void Move( double mx,double my);
		
		// assignment operators
		void operator+=(const Vector2& v);
		void operator-=(const Vector2& v);
		void operator*=(const Vector2& v);
		void operator/=(const Vector2& v);
		void operator*=(double s);
		void operator/=(double s);
		
		// binary operators
		Vector2 operator+(const Vector2& v) const;
		Vector2 operator-(const Vector2& v) const;
		Vector2 operator*(const Vector2& v) const;
		Vector2 operator/(const Vector2& v) const;
		Vector2 operator*(double s) const;
		Vector2 operator/(double s) const;
		friend Vector2 operator*(double s, const Vector2& v);
		
		// casting operators
		operator double*();
		operator const double*() const;
		
		// unary operators
		Vector2 operator+() const;
		Vector2 operator-() const;
		
		// equality operator
		bool operator==( const Vector2& v ) const;
		bool operator!=( const Vector2& p ) const;
		
		// assignment operator
		Vector2& operator=( const Vector2& v);
		
		double Distance( const Vector2& v );
		double Length();
		double DotProduct( const Vector2& v );
		// The cross-product of 2 vectors is only defined in 3D and 7D spaces
		//Vector2 CrossProduct( const Vector2& v );
		Vector2 Normal();
	}; //class
};

#endif