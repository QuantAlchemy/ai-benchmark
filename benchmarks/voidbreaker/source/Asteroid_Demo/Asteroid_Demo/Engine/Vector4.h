/*
 *  Vector4.h
 *  Advanced2D
 *
 *  Created by Ralph Smith on 7/10/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#include "Advanced2D.h"

#ifndef __VECTOR4_H__
#define __VECTOR4_H__


namespace Advanced2D {
	
	class Vector4 {
		//private:
	public:
		double x, y, z, w;
		
	public:
		Vector4();
		Vector4(const Vector4& v);
		Vector4(double x, double y, double z, double w);
		Vector4(int x, int y, int z, int w);
		
		void Set(double x1,double y1,double z1, double w1);
		void Set(const Vector4& v);
		double getX() { return x; }
		void setX(double v) { x = v; }
		double getY() { return y; }
		void setY(double v) { y = v; }
		double getZ() { return z; }
		void setZ(double v) { z = v; }
		double getW() { return w; }
		void setW(double v) { w = v; }
		void Move( double mx, double my, double mz, double mw);
		
		// assignment operators
		void operator+=(const Vector4& v);
		void operator-=(const Vector4& v);
		void operator*=(const Vector4& v);
		void operator/=(const Vector4& v);
		void operator*=(double s);
		void operator/=(double s);
		
		// binary operators
		Vector4 operator+(const Vector4& v) const;
		Vector4 operator-(const Vector4& v) const;
		Vector4 operator*(const Vector4& v) const;
		Vector4 operator/(const Vector4& v) const;
		Vector4 operator*(double s) const;
		Vector4 operator/(double s) const;
		friend Vector4 operator*(double s, const Vector4& v);
		
		// casting operators
		operator double*();
		operator const double*() const;
		
		// unary operators
		Vector4 operator+() const;
		Vector4 operator-() const;
		
		// equality operator
		bool operator==( const Vector4& v ) const;
		bool operator!=( const Vector4& p ) const;
		
		// assignment operator
		Vector4& operator=( const Vector4& v);
		
//		double Distance( const Vector4& v );
		double Length();
		double DotProduct( const Vector4& v );
//		Vector4 CrossProduct( const Vector4& v );
//		Vector4 Normal();
	}; //class
};

#endif