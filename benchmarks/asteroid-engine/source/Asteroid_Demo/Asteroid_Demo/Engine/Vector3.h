/*
 *  Vector3.h
 *  Advanced2D
 *
 *  Created by Ralph Smith on 7/10/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#include "Advanced2D.h"

#ifndef __VECTOR3_H__
#define __VECTOR3_H__


namespace Advanced2D {

	class Vector3 {
	//private:
	public:
		double x, y, z;
	
	public:
		Vector3();
		Vector3(const Vector3& v);
		Vector3(double x, double y, double z);
		Vector3(int x, int y, int z);
		
		void Set(double x1,double y1,double z1);
		void Set(const Vector3& v);
		double getX() { return x; }
		void setX(double v) { x = v; }
		double getY() { return y; }
		void setY(double v) { y = v; }
		double getZ() { return z; }
		void setZ(double v) { z = v; }
		void Move( double mx, double my, double mz);
		
		// assignment operators
		void operator+=(const Vector3& v);
		void operator-=(const Vector3& v);
		void operator*=(const Vector3& v);
		void operator/=(const Vector3& v);
		void operator*=(double s);
		void operator/=(double s);
		
		// binary operators
		Vector3 operator+(const Vector3& v) const;
		Vector3 operator-(const Vector3& v) const;
		Vector3 operator*(const Vector3& v) const;
		Vector3 operator/(const Vector3& v) const;
		Vector3 operator*(double s) const;
		Vector3 operator/(double s) const;
		friend Vector3 operator*(double s, const Vector3& v);
		
		// casting operators
		operator double*();
		operator const double*() const;
		
		// unary operators
		Vector3 operator+() const;
		Vector3 operator-() const;
		
		// equality operator
		bool operator==( const Vector3& v ) const;
		bool operator!=( const Vector3& p ) const;
		
		// assignment operator
		Vector3& operator=( const Vector3& v);
		
		double Distance( const Vector3& v );
		double Length();
		double DotProduct( const Vector3& v );
		Vector3 CrossProduct( const Vector3& v );
		Vector3 Normal();
	}; //class
};

#endif