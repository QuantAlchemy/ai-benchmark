/*
 *  Quaternion.cpp
 *  Advanced2D
 *
 *  Created by Ralph Smith on 7/10/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#include <cmath>

#include "Advanced2D.h"
#include "Quaternion.h"

namespace Advanced2D {
	
	Quaternion::Quaternion()
	{
		x = y = z = w = 0;
	}
	
	Quaternion::Quaternion( const Quaternion& v ) 
	{ 
		*this = v; 
	}
	
	Quaternion::Quaternion( double x, double y, double z, double w ) 
	{ 
		Set( x, y, z, w ); 
	}
	
	void Quaternion::Set( double x1, double y1, double z1, double w1 ) 
	{ 
		x=x1; y=y1; z=z1; w=w1; 
	}
	
	void Quaternion::Set( const Quaternion& v) 
	{ 
		x=v.x; y=v.y; z=v.z; w=v.w; 
	}
	
	// assignment operators
	void Quaternion::operator+=(const Quaternion& v) 
	{ 
		x+=v.x; y+=v.y; z+=v.z; w+=v.w;
	}
	
	void Quaternion::operator-=(const Quaternion& v) 
	{ 
		x-=v.x; y-=v.y; z-=v.z; w-=v.w;
	}
	
	void Quaternion::operator*=(const Quaternion& v) 
	{ 
		x*=v.x; y*=v.y; z*=v.z; w*=v.w;
	}
	
	void Quaternion::operator/=(const Quaternion& v) 
	{ 
		x/=v.x; y/=v.y; z/=v.z; w/=v.w;
	}
	
	void Quaternion::operator*=(double s) 
	{ 
		x*=s; y*=s; z*=s; w*=s;
	}
	
	void Quaternion::operator/=(double s) 
	{ 
		x/=s; y/=s; z/=s; w/=s;
	}
	
	// binary operators
	Quaternion Quaternion::operator+(const Quaternion& v) const 
	{ 
		return Quaternion(x+v.x, y+v.y, z+v.z, w+v.w);
	}
	
	Quaternion Quaternion::operator-(const Quaternion& v) const
	{ 
		return Quaternion(x-v.x, y-v.y, z-v.z, w-v.w);
	}
	
	Quaternion Quaternion::operator*(const Quaternion& v) const
	{ 
		return Quaternion(x*v.x, y*v.y, z*v.z, w*v.w);
	}
	
	Quaternion Quaternion::operator/(const Quaternion& v) const
	{ 
		return Quaternion(x/v.x, y/v.y, z/v.z, w/v.w);
	}
	
	Quaternion Quaternion::operator*(double s) const
	{ 
		return Quaternion(x*s, y*s, z*s, w*s);
	}
	
	Quaternion Quaternion::operator/(double s) const
	{ 
		return Quaternion(x/s, y/s, z/s, w/s);
	}
	
	Quaternion operator*(double s, const Quaternion& v)
	{ 
		return Quaternion(s*v.x, s*v.y, s*v.z, s*v.w);
	}
	
	// casting operators
	Quaternion::operator double*()
	{
		return (double*)this;
	}
	
	Quaternion::operator const double*() const
	{
		return (const double*)this;
	}
	
	// unary operators
	Quaternion Quaternion::operator+() const
	{
		return Quaternion(+x, +y, +z, +w);
	}
	
	Quaternion Quaternion::operator-() const
	{
		return Quaternion(-x, -y, -z, -w);
	}
	
	//equality operator comparison includes double rounding
	bool Quaternion::operator==( const Quaternion& v ) const
	{ 
		return (
				(((v.x - 0.0001f) < x) && (x < (v.x + 0.0001f))) &&
				(((v.y - 0.0001f) < y) && (y < (v.y + 0.0001f))) &&
				(((v.z - 0.0001f) < z) && (z < (v.z + 0.0001f))) &&
				(((v.w - 0.0001f) < w) && (w < (v.w + 0.0001f))) );
	}
	
	//inequality operator
	bool Quaternion::operator!=( const Quaternion& p ) const 
	{
		return (!(*this == p));
	}
	
	//assign operator
	Quaternion& Quaternion::operator=( const Quaternion& v) 
	{
		Set(v);
		return *this;
	}

}
