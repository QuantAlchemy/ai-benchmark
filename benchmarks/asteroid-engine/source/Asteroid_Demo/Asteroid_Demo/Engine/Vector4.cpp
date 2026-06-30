/*
 *  Vector4.cpp
 *  Advanced2D
 *
 *  Created by Ralph Smith on 7/10/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#include <cmath>

#include "Advanced2D.h"
#include "Vector4.h"

namespace Advanced2D {
	
	Vector4::Vector4()
	{
		x = y = z = w = 0;
	}
	
	Vector4::Vector4( const Vector4& v ) 
	{ 
		*this = v; 
	}
	
	Vector4::Vector4( double x, double y, double z, double w ) 
	{ 
		Set( x, y, z, w ); 
	}
	
	Vector4::Vector4( int x, int y, int z, int w)
	{ 
		Set((double)x,(double)y,(double)z,(double)w); 
	}
	
	void Vector4::Set( double x1, double y1, double z1, double w1 )
	{ 
		x=x1; y=y1; z=z1; w=w1;
	}
	
	void Vector4::Set( const Vector4& v) 
	{ 
		x=v.x; y=v.y; z=v.z; w=v.w;
	}
	
	void Vector4::Move( double mx, double my, double mz, double mw) 
	{ 
		x+=mx; y+=my; z+=mz; w+=mw;
	}
	
	// assignment operators
	void Vector4::operator+=(const Vector4& v) 
	{ 
		x+=v.x; y+=v.y; z+=v.z; w+=v.w;
	}
	
	void Vector4::operator-=(const Vector4& v) 
	{ 
		x-=v.x; y-=v.y; z-=v.z; w-=v.w;
	}
	
	void Vector4::operator*=(const Vector4& v) 
	{ 
		x*=v.x; y*=v.y; z*=v.z; w*=v.w;
	}
	
	void Vector4::operator/=(const Vector4& v) 
	{ 
		x/=v.x; y/=v.y; z/=v.z; w/=v.w;
	}
	
	void Vector4::operator*=(double s) 
	{ 
		x*=s; y*=s; z*=s; w*=s;
	}
	
	void Vector4::operator/=(double s) 
	{ 
		x/=s; y/=s; z/=s; w/=s;
	}
	
	// binary operators
	Vector4 Vector4::operator+(const Vector4& v) const 
	{ 
		return Vector4(x+v.x, y+v.y, z+v.z, w+v.w);
	}
	
	Vector4 Vector4::operator-(const Vector4& v) const
	{ 
		return Vector4(x-v.x, y-v.y, z-v.z, w-v.w);
	}
	
	Vector4 Vector4::operator*(const Vector4& v) const
	{ 
		return Vector4(x*v.x, y*v.y, z*v.z, w*v.w);
	}
	
	Vector4 Vector4::operator/(const Vector4& v) const
	{ 
		return Vector4(x/v.x, y/v.y, z/v.z, w/v.w);
	}
	
	Vector4 Vector4::operator*(double s) const
	{ 
		return Vector4(x*s, y*s, z*s, w*s);
	}
	
	Vector4 Vector4::operator/(double s) const
	{ 
		return Vector4(x/s, y/s, z/s, w/s);
	}
	
	Vector4 operator*(double s, const Vector4& v)
	{ 
		return Vector4(s*v.x, s*v.y, s*v.z, s*v.w);
	}
	
	// casting operators
	Vector4::operator double*()
	{
		return (double*)this;
	}
	
	Vector4::operator const double*() const
	{
		return (const double*)this;
	}
	
	// unary operators
	Vector4 Vector4::operator+() const
	{
		return Vector4(+x, +y, +z, +w);
	}
	
	Vector4 Vector4::operator-() const
	{
		return Vector4(-x, -y, -z, -w);
	}
	
	//equality operator comparison includes double rounding
	bool Vector4::operator==( const Vector4& v ) const
	{ 
		return (
				(((v.x - 0.0001f) < x) && (x < (v.x + 0.0001f))) &&
				(((v.y - 0.0001f) < y) && (y < (v.y + 0.0001f))) &&
				(((v.z - 0.0001f) < z) && (z < (v.z + 0.0001f))) &&
				(((v.w - 0.0001f) < w) && (w < (v.w + 0.0001f))) );
	}
	
	//inequality operator
	bool Vector4::operator!=( const Vector4& p ) const 
	{
		return (!(*this == p));
	}
	
	//assign operator
	Vector4& Vector4::operator=( const Vector4& v) 
	{
		Set(v);
		return *this;
	}
	
//	//distance only coded for 2D
//	double Vector4::Distance( const Vector4& v ) 
//	{
//		return sqrt((v.x-x)*(v.x-x) + (v.y-y)*(v.y-y));
//	}
	
	//Vector4 length is distance from the origin
	double Vector4::Length()
	{
		return sqrt(x*x + y*y + z*z + w*w);
	}
	
	//dot/scalar product: difference between two directions
	double Vector4::DotProduct( const Vector4& v )
	{
		return (x*v.x + y*v.y + z*v.z + w*v.w);
	}
	
//	//cross/Vector product is used to calculate the normal
//	Vector4 Vector4::CrossProduct( const Vector4& v )
//	{
//		double nx = (y*v.z)-(z*v.y);
//		double ny = (z*v.y)-(x*v.z);
//		double nz = (x*v.y)-(y*v.x);
//		return Vector4(nx,ny,nz);
//	}
//	
//	//calculate normal angle of the Vector
//	Vector4 Vector4::Normal()
//	{
//		double length;
//		if (Length() == 0)
//			length = 0;
//		else
//			length = 1 / Length();
//		double nx = x*length;
//		double ny = y*length;
//		double nz = z*length;
//		return Vector4(nx,ny,nz);
//	}
}
