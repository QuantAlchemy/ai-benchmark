/*
 *  math_extras.h
 *  Advanced2D
 *
 *  Created by Ralph Smith on 7/9/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#include "Advanced2D.h"

#ifndef __MATH_EXTRAS_H__
#define __MATH_EXTRAS_H__

using namespace Advanced2D;

Matrix* MatrixIdentity(Matrix *pout);

Matrix* MatrixTranslation(Matrix *pout, float x, float y, float z);

Vector4* Vec4Cross(Vector4 *pout, const Vector4 *pv1, const Vector4 *pv2, const Vector4 *pv3);

float MatrixDeterminant(const Matrix *pm);

Matrix* MatrixInverse(Matrix *pout, float *pdeterminant, const Matrix *pm);

Matrix* MatrixScaling(Matrix *pout, float sx, float sy, float sz);

Matrix* MatrixMultiply(Matrix *pout, const Matrix *pm1, const Matrix *pm2);

Matrix* MatrixRotationQuaternion(Matrix *pout, const Quaternion *pq);

Matrix* MatrixTransformation (Matrix *pout, const Vector3 *pscalingcenter, const Quaternion *pscalingrotation, const Vector3 *pscaling, const Vector3 *protationcenter, const Quaternion *protation, const Vector3 *ptranslation);

Matrix* MatrixTransformation2D (Matrix *pout, const Vector2 *pscalingcenter, float scalingrotation, const Vector2 *pscaling, const Vector2 *protationcenter, float rotation, const Vector2 *ptranslation);

#endif