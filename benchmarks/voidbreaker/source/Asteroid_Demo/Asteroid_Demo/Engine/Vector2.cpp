/*
 *  Vector2.cpp
 *  Advanced2D
 *
 *  Created by Ralph Smith on 7/10/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#include <cmath>

#include "Advanced2D.h"
#include "Vector2.h"

namespace Advanced2D {
	
	Vector2::Vector2()
	{
		x = y = 0;
	}
	
	Vector2::Vector2( const Vector2& v ) 
	{ 
		*this = v; 
	}
	
	Vector2::Vector2( double x, double y ) 
	{ 
		Set( x, y ); 
	}
	
	Vector2::Vector2( int x, int y)
	{ 
		Set((double)x,(double)y); 
	}
	
	void Vector2::Set( double x1,double y1 ) 
	{ 
		x=x1; y=y1;
	}
	
	void Vector2::Set( const Vector2& v) 
	{ 
		x=v.x; y=v.y;
	}
	
	void Vector2::Move( double mx,double my) 
	{ 
		x+=mx; y+=my;
	}
	
	// assignment operators
	void Vector2::operator+=(const Vector2& v) 
	{ 
		x+=v.x; y+=v.y;
	}
	
	void Vector2::operator-=(const Vector2& v) 
	{ 
		x-=v.x; y-=v.y;
	}
	
	void Vector2::operator*=(const Vector2& v) 
	{ 
		x*=v.x; y*=v.y;
	}
	
	void Vector2::operator/=(const Vector2& v) 
	{ 
		x/=v.x; y/=v.y;
	}
	
	void Vector2::operator*=(double s) 
	{ 
		x*=s; y*=s;
	}
	
	void Vector2::operator/=(double s) 
	{ 
		x/=s; y/=s;
	}
	
	// binary operators
	Vector2 Vector2::operator+(const Vector2& v) const 
	{ 
		return Vector2(x+v.x, y+v.y);
	}
	
	Vector2 Vector2::operator-(const Vector2& v) const
	{ 
		return Vector2(x-v.x, y-v.y);
	}
	
	Vector2 Vector2::operator*(const Vector2& v) const
	{ 
		return Vector2(x*v.x, y*v.y);
	}
	
	Vector2 Vector2::operator/(const Vector2& v) const
	{ 
		return Vector2(x/v.x, y/v.y);
	}
	
	Vector2 Vector2::operator*(double s) const
	{ 
		return Vector2(x*s, y*s);
	}
	
	Vector2 Vector2::operator/(double s) const
	{ 
		return Vector2(x/s, y/s);
	}
	
	Vector2 operator*(double s, const Vector2& v)
	{ 
		return Vector2(s*v.x, s*v.y);
	}
	
	// casting operators
	Vector2::operator double*()
	{
		return (double*)this;
	}
	
	Vector2::operator const double*() const
	{
		return (const double*)this;
	}
	
	// unary operators
	Vector2 Vector2::operator+() const
	{
		return Vector2(+x, +y);
	}
	
	Vector2 Vector2::operator-() const
	{
		return Vector2(-x, -y);
	}
	
	//equality operator comparison includes double rounding
	bool Vector2::operator==( const Vector2& v ) const
	{ 
		return (
				(((v.x - 0.0001f) < x) && (x < (v.x + 0.0001f))) &&
				(((v.y - 0.0001f) < y) && (y < (v.y + 0.0001f))) );
	}
	
	//inequality operator
	bool Vector2::operator!=( const Vector2& p ) const 
	{
		return (!(*this == p));
	}
	
	//assign operator
	Vector2& Vector2::operator=( const Vector2& v) 
	{
		Set(v);
		return *this;
	}
	
	//distance only coded for 2D
	double Vector2::Distance( const Vector2& v ) 
	{
		return sqrt((v.x-x)*(v.x-x) + (v.y-y)*(v.y-y));
	}
	
	//Vector2 length is distance from the origin
	double Vector2::Length()
	{
		return sqrt(x*x + y*y);
	}
	
	//dot/scalar product: difference between two directions
	double Vector2::DotProduct( const Vector2& v )
	{
		return (x*v.x + y*v.y);
	}
	
	//cross/Vector product is used to calculate the normal
	// The cross-product of 2 vectors is only defined in 3D and 7D spaces
//	Vector2 Vector2::CrossProduct( const Vector2& v )
//	{
//		double nx = (y*v.z)-(z*v.y);
//		double ny = (z*v.y)-(x*v.z);
//		double nz = (x*v.y)-(y*v.x);
//		return Vector2(nx,ny,nz);
//	}
	
	//calculate normal angle of the Vector
	Vector2 Vector2::Normal()
	{
		double length;
		if (Length() == 0)
			length = 0;
		else
			length = 1 / Length();
		double nx = x*length;
		double ny = y*length;
		return Vector2(nx,ny);
	}
}