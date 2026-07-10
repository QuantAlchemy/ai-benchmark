/*
 *  Matrix.cpp
 *  Advanced2D
 *
 *  Created by Ralph Smith on 6/21/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#include "Matrix.h"

Matrix::Matrix (const float* v)
{
	m[0][0] = ((Mat*)v)->m[0][0];
	m[0][1] = ((Mat*)v)->m[0][1];
	m[0][2] = ((Mat*)v)->m[0][2];
	m[0][3] = ((Mat*)v)->m[0][3];
	m[1][0] = ((Mat*)v)->m[1][0];
	m[1][1] = ((Mat*)v)->m[1][1];
	m[1][2] = ((Mat*)v)->m[1][2];
	m[1][3] = ((Mat*)v)->m[1][3];
	m[2][0] = ((Mat*)v)->m[2][0];
	m[2][1] = ((Mat*)v)->m[2][1];
	m[2][2] = ((Mat*)v)->m[2][2];
	m[2][3] = ((Mat*)v)->m[2][3];
	m[3][0] = ((Mat*)v)->m[3][0];
	m[3][1] = ((Mat*)v)->m[3][1];
	m[3][2] = ((Mat*)v)->m[3][2];
	m[3][3] = ((Mat*)v)->m[3][3];	
}


Matrix::Matrix (const Mat& v)
{
	m[0][0] = v.m[0][0];
	m[0][1] = v.m[0][1];
	m[0][2] = v.m[0][2];
	m[0][3] = v.m[0][3];
	m[1][0] = v.m[1][0];
	m[1][1] = v.m[1][1];
	m[1][2] = v.m[1][2];
	m[1][3] = v.m[1][3];
	m[2][0] = v.m[2][0];
	m[2][1] = v.m[2][1];
	m[2][2] = v.m[2][2];
	m[2][3] = v.m[2][3];
	m[3][0] = v.m[3][0];
	m[3][1] = v.m[3][1];
	m[3][2] = v.m[3][2];
	m[3][3] = v.m[3][3];
}


Matrix::Matrix (float _11, float _12, float _13, float _14,
						float _21, float _22, float _23, float _24,
						float _31, float _32, float _33, float _34,
						float _41, float _42, float _43, float _44 )
{
	m[0][0] = _11; m[0][1] = _12; m[0][2] = _13; m[0][3] = _14;
	m[1][0] = _21; m[1][1] = _22; m[1][2] = _23; m[1][3] = _24;
	m[2][0] = _31; m[2][1] = _32; m[2][2] = _33; m[2][3] = _34; 
	m[3][0] = _41; m[3][1] = _42; m[3][2] = _43; m[3][3] = _44;
}


float& Matrix::operator () (unsigned int Row, unsigned int Col)
{
	return m[Row][Col];
}


float Matrix::operator () (unsigned int Row, unsigned int Col) const
{
	return m[Row][Col];
}


Matrix::operator float* ()
{
	return (float*)m;
}

Matrix::operator const float* () const
{
	return (const float*)m;
}


Matrix::operator const double* () const
{
	return (const double*)m;
}


// assignment operators
Matrix& Matrix::operator *= (const Matrix& mat)
{
	Matrix temp (
					 m[0][0]*mat(0,0) + m[0][1]*mat(1,0) + m[0][2]*mat(2,0) + m[0][3]*mat(3,0),
					 m[0][0]*mat(0,1) + m[0][1]*mat(1,1) + m[0][2]*mat(2,1) + m[0][3]*mat(3,1),
					 m[0][0]*mat(0,2) + m[0][1]*mat(1,2) + m[0][2]*mat(2,2) + m[0][3]*mat(3,2),
					 m[0][0]*mat(0,3) + m[0][1]*mat(1,3) + m[0][2]*mat(2,3) + m[0][3]*mat(3,3),
					 
					 m[1][0]*mat(0,0) + m[1][1]*mat(1,0) + m[1][2]*mat(2,0) + m[1][3]*mat(3,0),
					 m[1][0]*mat(0,1) + m[1][1]*mat(1,1) + m[1][2]*mat(2,1) + m[1][3]*mat(3,1),
					 m[1][0]*mat(0,2) + m[1][1]*mat(1,2) + m[1][2]*mat(2,2) + m[1][3]*mat(3,2),
					 m[1][0]*mat(0,3) + m[1][1]*mat(1,3) + m[1][2]*mat(2,3) + m[1][3]*mat(3,3),
					 
					 m[2][0]*mat(0,0) + m[2][1]*mat(1,0) + m[2][2]*mat(2,0) + m[2][3]*mat(3,0),
					 m[2][0]*mat(0,1) + m[2][1]*mat(1,1) + m[2][2]*mat(2,1) + m[2][3]*mat(3,1),
					 m[2][0]*mat(0,2) + m[2][1]*mat(1,2) + m[2][2]*mat(2,2) + m[2][3]*mat(3,2),
					 m[2][0]*mat(0,3) + m[2][1]*mat(1,3) + m[2][2]*mat(2,3) + m[2][3]*mat(3,3),
					 
					 m[3][0]*mat(0,0) + m[3][1]*mat(1,0) + m[3][2]*mat(2,0) + m[3][3]*mat(3,0),
					 m[3][0]*mat(0,1) + m[3][1]*mat(1,1) + m[3][2]*mat(2,1) + m[3][3]*mat(3,1),
					 m[3][0]*mat(0,2) + m[3][1]*mat(1,2) + m[3][2]*mat(2,2) + m[3][3]*mat(3,2),
					 m[3][0]*mat(0,3) + m[3][1]*mat(1,3) + m[3][2]*mat(2,3) + m[3][3]*mat(3,3));
	
	return *this= temp;
}


Matrix& Matrix::operator += (const Matrix& mat)
{
	m[0][0] = m[0][0]+mat(0,0); m[0][1] = m[0][1]+mat(0,1); m[0][2] = m[0][2]+mat(0,2); m[0][3] = m[0][3]+mat(0,3);
	m[1][0] = m[1][0]+mat(1,0); m[1][1] = m[1][1]+mat(1,1); m[1][2] = m[1][2]+mat(1,2); m[1][3] = m[1][3]+mat(1,3);
	m[2][0] = m[2][0]+mat(2,0); m[2][1] = m[2][1]+mat(2,1); m[2][2] = m[2][2]+mat(2,2); m[2][3] = m[2][3]+mat(2,3);
	m[3][0] = m[3][0]+mat(3,0); m[3][1] = m[3][1]+mat(3,1); m[3][2] = m[3][2]+mat(3,2); m[3][3] = m[3][3]+mat(3,3);
	
	return *this;
}


Matrix& Matrix::operator -= (const Matrix& mat)
{
	m[0][0] = m[0][0]-mat(0,0); m[0][1] = m[0][1]-mat(0,1); m[0][2] = m[0][2]-mat(0,2); m[0][3] = m[0][3]-mat(0,3);
	m[1][0] = m[1][0]-mat(1,0); m[1][1] = m[1][1]-mat(1,1); m[1][2] = m[1][2]-mat(1,2); m[1][3] = m[1][3]-mat(1,3);
	m[2][0] = m[2][0]-mat(2,0); m[2][1] = m[2][1]-mat(2,1); m[2][2] = m[2][2]-mat(2,2); m[2][3] = m[2][3]-mat(2,3);
	m[3][0] = m[3][0]-mat(3,0); m[3][1] = m[3][1]-mat(3,1); m[3][2] = m[3][2]-mat(3,2); m[3][3] = m[3][3]-mat(3,3);
	
	return *this;	
}


Matrix& Matrix::operator *= (float s)
{
	m[0][0] *= s; m[0][1] *= s; m[0][2] *= s; m[0][3] *= s;
	m[1][0] *= s; m[1][1] *= s; m[1][2] *= s; m[1][3] *= s;
	m[2][0] *= s; m[2][1] *= s; m[2][2] *= s; m[2][3] *= s;
	m[3][0] *= s; m[3][1] *= s; m[3][2] *= s; m[3][3] *= s;
	
	return *this;
}


Matrix& Matrix::operator /= (float s)
{
	m[0][0] /= s; m[0][1] /= s; m[0][2] /= s; m[0][3] /= s;
	m[1][0] /= s; m[1][1] /= s; m[1][2] /= s; m[1][3] /= s;
	m[2][0] /= s; m[2][1] /= s; m[2][2] /= s; m[2][3] /= s;
	m[3][0] /= s; m[3][1] /= s; m[3][2] /= s; m[3][3] /= s;
	
	return *this;
}


// unary operators
Matrix Matrix::operator + () const
{
	// don't really know what I should do here
	return Matrix (
					   m[0][0], m[0][1], m[0][2], m[0][3],
					   m[1][0], m[1][1], m[1][2], m[1][3],
					   m[2][0], m[2][1], m[2][2], m[2][3],
					   m[3][0], m[3][1], m[3][2], m[3][3]);	
}


Matrix Matrix::operator - () const
{
	return Matrix (
					   -(m[0][0]), (-m[0][1]), -m[0][2], -m[0][3],
					   -m[1][0], -m[1][1], -m[1][2], -m[1][3],
					   -m[2][0], -m[2][1], -m[2][2], -m[2][3],
					   -m[3][0], -m[3][1], -m[3][2], -m[3][3]);
}


// binary operators
Matrix Matrix::operator * (const Matrix& mat) const
{
	return Matrix (
					   m[0][0]*mat(0,0) + m[0][1]*mat(1,0) + m[0][2]*mat(2,0) + m[0][3]*mat(3,0),
					   m[0][0]*mat(0,1) + m[0][1]*mat(1,1) + m[0][2]*mat(2,1) + m[0][3]*mat(3,1),
					   m[0][0]*mat(0,2) + m[0][1]*mat(1,2) + m[0][2]*mat(2,2) + m[0][3]*mat(3,2),
					   m[0][0]*mat(0,3) + m[0][1]*mat(1,3) + m[0][2]*mat(2,3) + m[0][3]*mat(3,3),
					   
					   m[1][0]*mat(0,0) + m[1][1]*mat(1,0) + m[1][2]*mat(2,0) + m[1][3]*mat(3,0),
					   m[1][0]*mat(0,1) + m[1][1]*mat(1,1) + m[1][2]*mat(2,1) + m[1][3]*mat(3,1),
					   m[1][0]*mat(0,2) + m[1][1]*mat(1,2) + m[1][2]*mat(2,2) + m[1][3]*mat(3,2),
					   m[1][0]*mat(0,3) + m[1][1]*mat(1,3) + m[1][2]*mat(2,3) + m[1][3]*mat(3,3),
					   
					   m[2][0]*mat(0,0) + m[2][1]*mat(1,0) + m[2][2]*mat(2,0) + m[2][3]*mat(3,0),
					   m[2][0]*mat(0,1) + m[2][1]*mat(1,1) + m[2][2]*mat(2,1) + m[2][3]*mat(3,1),
					   m[2][0]*mat(0,2) + m[2][1]*mat(1,2) + m[2][2]*mat(2,2) + m[2][3]*mat(3,2),
					   m[2][0]*mat(0,3) + m[2][1]*mat(1,3) + m[2][2]*mat(2,3) + m[2][3]*mat(3,3),
					   
					   m[3][0]*mat(0,0) + m[3][1]*mat(1,0) + m[3][2]*mat(2,0) + m[3][3]*mat(3,0),
					   m[3][0]*mat(0,1) + m[3][1]*mat(1,1) + m[3][2]*mat(2,1) + m[3][3]*mat(3,1),
					   m[3][0]*mat(0,2) + m[3][1]*mat(1,2) + m[3][2]*mat(2,2) + m[3][3]*mat(3,2),
					   m[3][0]*mat(0,3) + m[3][1]*mat(1,3) + m[3][2]*mat(2,3) + m[3][3]*mat(3,3));
}


Matrix Matrix::operator + (const Matrix& mat) const
{
	return Matrix (
					   m[0][0]+mat(0,0), m[0][1]+mat(0,1), m[0][2]+mat(0,2), m[0][3]+mat(0,3),
					   m[1][0]+mat(1,0), m[1][1]+mat(1,1), m[1][2]+mat(1,2), m[1][3]+mat(1,3),
					   m[2][0]+mat(2,0), m[2][1]+mat(2,1), m[2][2]+mat(2,2), m[2][3]+mat(2,3),
					   m[3][0]+mat(3,0), m[3][1]+mat(3,1), m[3][2]+mat(3,2), m[3][3]+mat(3,3));
}


Matrix Matrix::operator - (const Matrix& mat) const
{
	return Matrix (
					   m[0][0]-mat(0,0), m[0][1]-mat(0,1), m[0][2]-mat(0,2), m[0][3]-mat(0,3),
					   m[1][0]-mat(1,0), m[1][1]-mat(1,1), m[1][2]-mat(1,2), m[1][3]-mat(1,3),
					   m[2][0]-mat(2,0), m[2][1]-mat(2,1), m[2][2]-mat(2,2), m[2][3]-mat(2,3),
					   m[3][0]-mat(3,0), m[3][1]-mat(3,1), m[3][2]-mat(3,2), m[3][3]-mat(3,3));	
}


Matrix Matrix::operator * (float s) const
{
	return Matrix (
					   m[0][0]*s, m[0][1]*s, m[0][2]*s, m[0][3]*s,
					   m[1][0]*s, m[1][1]*s, m[1][2]*s, m[1][3]*s,
					   m[2][0]*s, m[2][1]*s, m[2][2]*s, m[2][3]*s,
					   m[3][0]*s, m[3][1]*s, m[3][2]*s, m[3][3]*s);	
}


Matrix Matrix::operator / (float s) const
{
	return Matrix (
					   m[0][0]/s, m[0][1]/s, m[0][2]/s, m[0][3]/s,
					   m[1][0]/s, m[1][1]/s, m[1][2]/s, m[1][3]/s,
					   m[2][0]/s, m[2][1]/s, m[2][2]/s, m[2][3]/s,
					   m[3][0]/s, m[3][1]/s, m[3][2]/s, m[3][3]/s);		
}


Matrix operator * (float s, const Matrix& mat)
{
	return Matrix (
					   mat(0,0)*s, mat(0,1)*s, mat(0,2)*s, mat(0,3)*s,
					   mat(1,0)*s, mat(1,1)*s, mat(1,2)*s, mat(1,3)*s,
					   mat(2,0)*s, mat(2,1)*s, mat(2,2)*s, mat(2,3)*s,
					   mat(3,0)*s, mat(3,1)*s, mat(3,2)*s, mat(3,3)*s);	
}


// equality operators
bool Matrix::operator == (const Matrix& mat) const
{
	return (
			m[0][0] == mat(0,0) && m[0][1] == mat(0,1) && m[0][2] == mat(0,2) && m[0][3] == mat(0,3) &&
			m[1][0] == mat(1,0) && m[1][1] == mat(1,1) && m[1][2] == mat(1,2) && m[1][3] == mat(1,3) &&
			m[2][0] == mat(2,0) && m[2][1] == mat(2,1) && m[2][2] == mat(2,2) && m[2][3] == mat(2,3) &&
			m[3][0] == mat(3,0) && m[3][1] == mat(3,1) && m[3][2] == mat(3,2) && m[3][3] == mat(3,3));		
}


bool Matrix::operator != (const Matrix& mat) const
{
	return (
			m[0][0] != mat(0,0) || m[0][1] != mat(0,1) || m[0][2] != mat(0,2) || m[0][3] != mat(0,3) ||
			m[1][0] != mat(1,0) || m[1][1] != mat(1,1) || m[1][2] != mat(1,2) || m[1][3] != mat(1,3) ||
			m[2][0] != mat(2,0) || m[2][1] != mat(2,1) || m[2][2] != mat(2,2) || m[2][3] != mat(2,3) ||
			m[3][0] != mat(3,0) || m[3][1] != mat(3,1) || m[3][2] != mat(3,2) || m[3][3] != mat(3,3));			
}




