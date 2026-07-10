/*
 *  Quaternion.h
 *  Advanced2D
 *
 *  Created by Ralph Smith on 7/10/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#include "Advanced2D.h"

#ifndef __QUATERNION_H__
#define __QUATERNION_H__


namespace Advanced2D {
	
	class Quaternion {
	//private:
	public:
		double x, y, z, w;
		
	public:
		Quaternion();
		Quaternion(const Quaternion& v);
		Quaternion(const double *q);
		Quaternion(double x, double y, double z, double w);
		
		void Set(double x1,double y1,double z1, double w1);
		void Set(const Quaternion& v);
		double getX() { return x; }
		void setX(double v) { x = v; }
		double getY() { return y; }
		void setY(double v) { y = v; }
		double getZ() { return z; }
		void setZ(double v) { z = v; }
		double getW() { return w; }
		void setW(double v) { w = v; }
		
		// assignment operators
		void operator+=(const Quaternion& v);
		void operator-=(const Quaternion& v);
		void operator*=(const Quaternion& v);
		void operator/=(const Quaternion& v);
		void operator*=(double s);
		void operator/=(double s);
		
		// binary operators
		Quaternion operator+(const Quaternion& v) const;
		Quaternion operator-(const Quaternion& v) const;
		Quaternion operator*(const Quaternion& v) const;
		Quaternion operator/(const Quaternion& v) const;
		Quaternion operator*(double s) const;
		Quaternion operator/(double s) const;
		friend Quaternion operator*(double s, const Quaternion& v);
		
		// casting operators
		operator double*();
		operator const double*() const;
		
		// unary operators
		Quaternion operator+() const;
		Quaternion operator-() const;
		
		// equality operator
		bool operator==( const Quaternion& v ) const;
		bool operator!=( const Quaternion& p ) const;
		
		// assignment operator
		Quaternion& operator=( const Quaternion& v);

	}; //class
};

#endif