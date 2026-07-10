/*
 *  Vector3.cpp
 *  Advanced2D
 *
 *  Created by Ralph Smith on 7/10/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#include <cmath>

#include "Advanced2D.h"
#include "Vector3.h"

namespace Advanced2D {

	Vector3::Vector3()
	{
		x = y = z = 0;
	}
	
	Vector3::Vector3( const Vector3& v ) 
	{ 
		*this = v; 
	}
	
	Vector3::Vector3( double x, double y, double z ) 
	{ 
		Set( x, y, z ); 
	}
	
	Vector3::Vector3( int x, int y, int z)
	{ 
		Set((double)x,(double)y,(double)z); 
	}
	
	void Vector3::Set( double x1, double y1, double z1 ) 
	{ 
		x=x1; y=y1; z=z1; 
	}
	
	void Vector3::Set( const Vector3& v) 
	{ 
		x=v.x; y=v.y; z=v.z; 
	}
	
	void Vector3::Move( double mx,double my,double mz) 
	{ 
		x+=mx; y+=my; z+=mz; 
	}
	
	// assignment operators
	void Vector3::operator+=(const Vector3& v) 
	{ 
		x+=v.x; y+=v.y; z+=v.z; 
	}
	
	void Vector3::operator-=(const Vector3& v) 
	{ 
		x-=v.x; y-=v.y; z-=v.z; 
	}
	
	void Vector3::operator*=(const Vector3& v) 
	{ 
		x*=v.x; y*=v.y; z*=v.z; 
	}
	
	void Vector3::operator/=(const Vector3& v) 
	{ 
		x/=v.x; y/=v.y; z/=v.z; 
	}
	
	void Vector3::operator*=(double s) 
	{ 
		x*=s; y*=s; z*=s; 
	}
	
	void Vector3::operator/=(double s) 
	{ 
		x/=s; y/=s; z/=s; 
	}
	
	// binary operators
	Vector3 Vector3::operator+(const Vector3& v) const 
	{ 
		return Vector3(x+v.x, y+v.y, z+v.z);
	}
	
	Vector3 Vector3::operator-(const Vector3& v) const
	{ 
		return Vector3(x-v.x, y-v.y, z-v.z);
	}
	
	Vector3 Vector3::operator*(const Vector3& v) const
	{ 
		return Vector3(x*v.x, y*v.y, z*v.z);
	}
	
	Vector3 Vector3::operator/(const Vector3& v) const
	{ 
		return Vector3(x/v.x, y/v.y, z/v.z);
	}
	
	Vector3 Vector3::operator*(double s) const
	{ 
		return Vector3(x*s, y*s, z*s);
	}
	
	Vector3 Vector3::operator/(double s) const
	{ 
		return Vector3(x/s, y/s, z/s);
	}
	
	Vector3 operator*(double s, const Vector3& v)
	{ 
		return Vector3(s*v.x, s*v.y, s*v.z);
	}
	
	// casting operators
	Vector3::operator double*()
	{
		return (double*)this;
	}
	
	Vector3::operator const double*() const
	{
		return (const double*)this;
	}
	
	// unary operators
	Vector3 Vector3::operator+() const
	{
		return Vector3(+x, +y, +z);
	}
	
	Vector3 Vector3::operator-() const
	{
		return Vector3(-x, -y, -z);
	}
	
	//equality operator comparison includes double rounding
	bool Vector3::operator==( const Vector3& v ) const
	{ 
		return (
			(((v.x - 0.0001f) < x) && (x < (v.x + 0.0001f))) &&
			(((v.y - 0.0001f) < y) && (y < (v.y + 0.0001f))) &&
			(((v.z - 0.0001f) < z) && (z < (v.z + 0.0001f))) );
	}
	
	//inequality operator
	bool Vector3::operator!=( const Vector3& p ) const 
	{
		return (!(*this == p));
	}
	
	//assign operator
	Vector3& Vector3::operator=( const Vector3& v) 
	{
		Set(v);
		return *this;
	}
	
	//distance only coded for 2D
	double Vector3::Distance( const Vector3& v ) 
	{
		return sqrt((v.x-x)*(v.x-x) + (v.y-y)*(v.y-y));
	}
	
	//Vector3 length is distance from the origin
	double Vector3::Length()
	{
		return sqrt(x*x + y*y + z*z);
	}
	
	//dot/scalar product: difference between two directions
	double Vector3::DotProduct( const Vector3& v )
	{
		return (x*v.x + y*v.y + z*v.z);
	}
	
	//cross/Vector product is used to calculate the normal
	Vector3 Vector3::CrossProduct( const Vector3& v )
	{
		double nx = (y*v.z)-(z*v.y);
		double ny = (z*v.y)-(x*v.z);
		double nz = (x*v.y)-(y*v.x);
		return Vector3(nx,ny,nz);
	}
	
	//calculate normal angle of the Vector
	Vector3 Vector3::Normal()
	{
		double length;
		if (Length() == 0)
			length = 0;
		else
			length = 1 / Length();
		double nx = x*length;
		double ny = y*length;
		double nz = z*length;
		return Vector3(nx,ny,nz);
	}
}
