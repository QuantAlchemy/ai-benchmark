/*
 *  math_extras.cpp
 *  Advanced2D
 *
 *  Created by Ralph Smith on 7/10/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#include "math_extras.h"

Matrix* MatrixIdentity(Matrix *pout)
{
	pout->m[0][0] = 1; pout->m[0][1] = 0; pout->m[0][2] = 0; pout->m[0][3] = 0;
	pout->m[1][0] = 0; pout->m[1][1] = 1; pout->m[1][2] = 0; pout->m[1][3] = 0;
	pout->m[2][0] = 0; pout->m[2][1] = 0; pout->m[2][2] = 1; pout->m[2][3] = 0;
	pout->m[3][0] = 0; pout->m[3][1] = 0; pout->m[3][2] = 0; pout->m[3][3] = 1;
	return pout;
}

Matrix* MatrixTranslation(Matrix *pout, float x, float y, float z)
{
	MatrixIdentity(pout);
	pout->m[3][0] = x;
	pout->m[3][1] = y;
	pout->m[3][2] = z;
	return pout;
}

Vector4* Vec4Cross(Vector4 *pout, const Vector4 *pv1, const Vector4 *pv2, const Vector4 *pv3)
{
	Vector4 out;
	out.x = pv1->y * (pv2->z * pv3->w - pv3->z * pv2->w) - pv1->z * (pv2->y * pv3->w - pv3->y * pv2->w) + pv1->w * (pv2->y * pv3->z - pv2->z *pv3->y);
	out.y = -(pv1->x * (pv2->z * pv3->w - pv3->z * pv2->w) - pv1->z * (pv2->x * pv3->w - pv3->x * pv2->w) + pv1->w * (pv2->x * pv3->z - pv3->x * pv2->z));
	out.z = pv1->x * (pv2->y * pv3->w - pv3->y * pv2->w) - pv1->y * (pv2->x *pv3->w - pv3->x * pv2->w) + pv1->w * (pv2->x * pv3->y - pv3->x * pv2->y);
	out.w = -(pv1->x * (pv2->y * pv3->z - pv3->y * pv2->z) - pv1->y * (pv2->x * pv3->z - pv3->x *pv2->z) + pv1->z * (pv2->x * pv3->y - pv3->x * pv2->y));
	*pout = out;
	return pout;
}

float MatrixDeterminant(const Matrix *pm)
{
	Vector4 minor, v1, v2, v3;
	float det;
	
	v1.x = pm->m[0][0]; v1.y = pm->m[1][0]; v1.z = pm->m[2][0]; v1.w = pm->m[3][0];
	v2.x = pm->m[0][1]; v2.y = pm->m[1][1]; v2.z = pm->m[2][1]; v2.w = pm->m[3][1];
	v3.x = pm->m[0][2]; v3.y = pm->m[1][2]; v3.z = pm->m[2][2]; v3.w = pm->m[3][2];
	Vec4Cross(&minor, &v1, &v2, &v3);
	det =  - (pm->m[0][3] * minor.x + pm->m[1][3] * minor.y + pm->m[2][3] * minor.z + pm->m[3][3] * minor.w);
	return det;
}

Matrix* MatrixInverse(Matrix *pout, float *pdeterminant, const Matrix *pm)
{
	int a, i, j;
	Matrix out;
	Vector4 v, vec[3];
	float det;
	
	det = MatrixDeterminant(pm);
	if ( !det ) return NULL;
	if ( pdeterminant ) *pdeterminant = det;
	for (i=0; i<4; i++)
	{
		for (j=0; j<4; j++)
		{
			if (j != i )
			{
				a = j;
				if ( j > i ) a = a-1;
				vec[a].x = pm->m[j][0];
				vec[a].y = pm->m[j][1];
				vec[a].z = pm->m[j][2];
				vec[a].w = pm->m[j][3];
			}
		}
		Vec4Cross(&v, &vec[0], &vec[1], &vec[2]);
		out.m[0][i] = pow(-1.0f, i) * v.x / det;
		out.m[1][i] = pow(-1.0f, i) * v.y / det;
		out.m[2][i] = pow(-1.0f, i) * v.z / det;
		out.m[3][i] = pow(-1.0f, i) * v.w / det;
	}
	
	*pout = out;
	return pout;
}

Matrix* MatrixScaling(Matrix *pout, float sx, float sy, float sz)
{
	MatrixIdentity(pout);
	pout->m[0][0] = sx;
	pout->m[1][1] = sy;
	pout->m[2][2] = sz;
	return pout;
}

Matrix* MatrixMultiply(Matrix *pout, const Matrix *pm1, const Matrix *pm2)
{
	Matrix out;
	int i,j;
	
	for (i=0; i<4; i++)
	{
		for (j=0; j<4; j++)
		{
			out.m[i][j] = pm1->m[i][0] * pm2->m[0][j] + pm1->m[i][1] * pm2->m[1][j] + pm1->m[i][2] * pm2->m[2][j] + pm1->m[i][3] * pm2->m[3][j];
		}
	}
	
	*pout = out;
	return pout;
}

Matrix* MatrixRotationQuaternion(Matrix *pout, const Quaternion *pq)
{
	MatrixIdentity(pout);
	pout->m[0][0] = 1.0f - 2.0f * (pq->y * pq->y + pq->z * pq->z);
	pout->m[0][1] = 2.0f * (pq->x *pq->y + pq->z * pq->w);
	pout->m[0][2] = 2.0f * (pq->x * pq->z - pq->y * pq->w);
	pout->m[1][0] = 2.0f * (pq->x * pq->y - pq->z * pq->w);
	pout->m[1][1] = 1.0f - 2.0f * (pq->x * pq->x + pq->z * pq->z);
	pout->m[1][2] = 2.0f * (pq->y *pq->z + pq->x *pq->w);
	pout->m[2][0] = 2.0f * (pq->x * pq->z + pq->y * pq->w);
	pout->m[2][1] = 2.0f * (pq->y *pq->z - pq->x *pq->w);
	pout->m[2][2] = 1.0f - 2.0f * (pq->x * pq->x + pq->y * pq->y);
	return pout;
}

Matrix* MatrixTransformation (Matrix *pout, const Vector3 *pscalingcenter, const Quaternion *pscalingrotation, const Vector3 *pscaling, const Vector3 *protationcenter, const Quaternion *protation, const Vector3 *ptranslation)
{
	Matrix m1, m2, m3, m4, m5, m6, m7;
	Quaternion prc;
	Vector3 psc, pt;
	
	if (!pscalingcenter)
	{
		psc.x = 0.0f;
		psc.y = 0.0f;
		psc.z = 0.0f;
	}
	else
	{
		psc.x = pscalingcenter->x;
		psc.y = pscalingcenter->y;
		psc.z = pscalingcenter->z;
	}
	
	if (!protationcenter)
	{
		prc.x = 0.0f;
		prc.y = 0.0f;
		prc.z = 0.0f;
	}
	else
	{
		prc.x = protationcenter->x;
		prc.y = protationcenter->y;
		prc.z = protationcenter->z;
	}
	
	if (!ptranslation)
	{
		pt.x = 0.0f;
		pt.y = 0.0f;
		pt.z = 0.0f;
	}
	else
	{
		pt.x = ptranslation->x;
		pt.y = ptranslation->y;
		pt.z = ptranslation->z;
	}
	
	MatrixTranslation(&m1, -psc.x, -psc.y, -psc.z);
	
	if (!pscalingrotation)
	{
		MatrixIdentity(&m2);
		MatrixIdentity(&m4);
	}
	else
	{
		MatrixRotationQuaternion(&m4, pscalingrotation);
		MatrixInverse(&m2, NULL, &m4);
	}
	
	if (!pscaling) MatrixIdentity(&m3);
	else MatrixScaling(&m3, pscaling->x, pscaling->y, pscaling->z);
	
	if (!protation) MatrixIdentity(&m6);
	else MatrixRotationQuaternion(&m6, protation);
	
	MatrixTranslation(&m5, psc.x - prc.x,  psc.y - prc.y,  psc.z - prc.z);
	MatrixTranslation(&m7, prc.x + pt.x, prc.y + pt.y, prc.z + pt.z);
	MatrixMultiply(&m1, &m1, &m2);
	MatrixMultiply(&m1, &m1, &m3);
	MatrixMultiply(&m1, &m1, &m4);
	MatrixMultiply(&m1, &m1, &m5);
	MatrixMultiply(&m1, &m1, &m6);
	MatrixMultiply(pout, &m1, &m7);
	return pout;
}

Matrix* MatrixTransformation2D (Matrix *pout, const Vector2 *pscalingcenter, float scalingrotation, const Vector2 *pscaling, const Vector2 *protationcenter, float rotation, const Vector2 *ptranslation)
{
	Quaternion rot, sca_rot;
	Vector3 rot_center, sca, sca_center, trans;
	
	if (pscalingcenter)
	{
		sca_center.x=pscalingcenter->x;
		sca_center.y=pscalingcenter->y;
		sca_center.z=0.0f;
	}
	else
	{
		sca_center.x=0.0f;
		sca_center.y=0.0f;
		sca_center.z=0.0f;
	}
	
	if (pscaling)
	{
		sca.x=pscaling->x;
		sca.y=pscaling->y;
		sca.z=1.0f;
	}
	else
	{
		sca.x=1.0f;
		sca.y=1.0f;
		sca.z=1.0f;
	}
	
	if (protationcenter)
	{
		rot_center.x=protationcenter->x;
		rot_center.y=protationcenter->y;
		rot_center.z=0.0f;
	}
	else
	{
		rot_center.x=0.0f;
		rot_center.y=0.0f;
		rot_center.z=0.0f;
	}
	
	if (ptranslation)
	{
		trans.x=ptranslation->x;
		trans.y=ptranslation->y;
		trans.z=0.0f;
	}
	else
	{
		trans.x=0.0f;
		trans.y=0.0f;
		trans.z=0.0f;
	}
	
	rot.w=cos(rotation/2.0f);
	rot.x=0.0f;
	rot.y=0.0f;
	rot.z=sin(rotation/2.0f);
	
	sca_rot.w=cos(scalingrotation/2.0f);
	sca_rot.x=0.0f;
	sca_rot.y=0.0f;
	sca_rot.z=sin(scalingrotation/2.0f);
	
	MatrixTransformation(pout, &sca_center, &sca_rot, &sca, &rot_center, &rot, &trans);
	
	return pout;
}