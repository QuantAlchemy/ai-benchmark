/*
 *  Matrix.h
 *  Advanced2D
 *
 *  Created by Ralph Smith on 6/21/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 *	This class is modeled after the D3DXMATRIX class used for directX
 *
 */

#ifndef __MAT_H__
#define __MAT_H__
typedef struct _Matrix {
    union {
        struct {
            float        _11, _12, _13, _14;
            float        _21, _22, _23, _24;
            float        _31, _32, _33, _34;
            float        _41, _42, _43, _44;
			
        };
        float m[4][4];
    };
} Mat;
#endif


#ifndef __MATRIX_STRUCT_H__
#define __MATRIX_STRUCT_H__
typedef struct Matrix : public Mat
{
public:
    Matrix() {};
    Matrix( const float* );
    Matrix( const Mat& );
    Matrix( float _11, float _12, float _13, float _14,
			   float _21, float _22, float _23, float _24,
			   float _31, float _32, float _33, float _34,
			   float _41, float _42, float _43, float _44 );
	
	
    // access grants
    float& operator () ( unsigned int Row, unsigned int Col );
    float  operator () ( unsigned int Row, unsigned int Col ) const;
	
    // casting operators
    operator float* ();
    operator const float* () const;
	operator const double* () const;
	
    // assignment operators
    Matrix& operator *= ( const Matrix& );
    Matrix& operator += ( const Matrix& );
    Matrix& operator -= ( const Matrix& );
    Matrix& operator *= ( float );
    Matrix& operator /= ( float );
	
    // unary operators
    Matrix operator + () const;
    Matrix operator - () const;
	
    // binary operators
    Matrix operator * ( const Matrix& ) const;
    Matrix operator + ( const Matrix& ) const;
    Matrix operator - ( const Matrix& ) const;
    Matrix operator * ( float ) const;
    Matrix operator / ( float ) const;
	
    friend Matrix operator * ( float, const Matrix& );
	
    bool operator == ( const Matrix& ) const;
    bool operator != ( const Matrix& ) const;
	
	// 	float dot ( const Matrix& m ) const { 
	// 		//return m_x * q.x() + m_y * q.y() + m_z * q.z() + m_unusedW * q.m_unusedW;
	// 	}
	// 	float length_squared () const { return dot (*this); }
	// 	float length () const { return sqrt (length_squared()); }
	// 	Matrix& normalize () { return *this /= length(); }
	// 	Matrix normalized () { return *this / length(); }
	
} Matrix;
#endif