# Clash Detection - User Guide

## Overview
The BIM Assistant now includes **automated clash detection** using advanced geometric algorithms:
- **BVH (Bounding Volume Hierarchy)** for efficient spatial queries
- **AABB (Axis-Aligned Bounding Boxes)** for broad-phase collision detection
- **Trimesh collision detection** for precise penetration depth calculation

## How to Use Clash Detection

### Step 1: Upload & Convert Files
1. Navigate to **Projects** page
2. Create a new project or select an existing one
3. Upload IFC files (must be converted to GLB format)
4. Wait for file conversion to complete (real-time progress tracking)

### Step 2: Run Clash Detection
1. Open your project in the **Project View** page
2. Click the **"🔍 Run Clash Detection"** button in the top-right corner
3. A progress modal will appear showing:
   - Current status (Loading models → Building BVH → Detecting clashes → Saving results)
   - Progress percentage (0-100%)
   - Real-time updates via Server-Sent Events (SSE)

### Step 3: View Results
Once complete, the **Clash Report** panel (right side) will display:

#### Summary Cards
- **Total Clashes**: All detected conflicts
- **Critical**: Penetration > 10cm
- **Major**: Penetration 5-10cm
- **Minor**: Penetration 1-5cm

#### Filters
- **By Severity**: Filter clashes by critical/major/minor
- **By Category**: Show only clashes involving specific categories (pipes, ducts, walls, etc.)

#### Clash Details
Each clash item shows:
- **Severity badge** (color-coded: red/orange/blue)
- **Clash ID** (unique identifier)
- **Object 1 vs Object 2** (categories involved)
- **Penetration depth** (in centimeters)
- **3D Position** (x, y, z coordinates)
- **Required clearance** (if applicable)

## Clash Detection Rules

### Clearance Matrix
The system checks the following category pairs:

| Category 1   | Category 2   | Min. Clearance |
|--------------|--------------|----------------|
| Pipes        | Pipes        | 5 cm           |
| Pipes        | Ducts        | 10 cm          |
| Pipes        | Walls        | 0 cm (contact) |
| Pipes        | Slabs        | 0 cm (contact) |
| Pipes        | Electrical   | 5 cm           |
| Ducts        | Ducts        | 10 cm          |
| Ducts        | Walls        | 0 cm (contact) |
| Ducts        | Slabs        | 0 cm (contact) |
| Ducts        | Electrical   | 10 cm          |
| Electrical   | Walls        | 0 cm (contact) |
| Electrical   | Slabs        | 0 cm (contact) |

**Note**: Categories not in this matrix are not checked for clashes.

### Severity Classification
- **Critical**: Penetration ≥ 10 cm
- **Major**: Penetration ≥ 5 cm and < 10 cm
- **Minor**: Penetration ≥ 1 cm and < 5 cm
- **Clearance Violation**: Distance < required clearance (no actual penetration)

## Technical Architecture

### Backend (Node.js)
- **Route**: `POST /api/reports/generate`
- **Parameters**: 
  ```json
  {
    "projectId": "uuid",
    "fileIds": ["uuid1", "uuid2"],
    "settings": {}
  }
  ```
- **Response**: Creates ClashReport record, publishes job to RabbitMQ

### Python Worker
- **Queue**: `bim.clash-detection`
- **Algorithm Pipeline**:
  1. Load GLB models from MinIO
  2. Group meshes by category
  3. Build BVH tree for each category
  4. Query BVH for broad-phase detection (AABB intersections)
  5. Narrow-phase collision detection (Trimesh)
  6. Calculate penetration depth
  7. Classify severity
  8. Save results to database

### Database Schema
```sql
CREATE TABLE clash_reports (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  user_id UUID REFERENCES users(id),
  status VARCHAR (pending, processing, completed, failed),
  progress INT (0-100),
  status_message TEXT,
  total_clashes INT,
  critical_clashes INT,
  major_clashes INT,
  minor_clashes INT,
  clashes_data JSONB,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  completed_at TIMESTAMP
);
```

### Frontend (React + TypeScript)
- **Component**: `ClashReport.tsx`
- **Hook**: `useClashProgress.ts` (SSE connection)
- **Modal**: `ClashProgressModal.tsx` (real-time updates)
- **API**: `GET /api/progress/clash/:reportId` (Server-Sent Events)

## Performance Optimization

### BVH Tree Benefits
- **O(log n)** query time instead of O(n²) brute force
- Spatial partitioning reduces unnecessary collision checks
- Scales well with large models (10,000+ objects)

### AABB Broad Phase
- Fast axis-aligned box intersection tests
- Filters out 90%+ of non-colliding pairs
- Only candidates proceed to narrow phase

### Trimesh Narrow Phase
- Precise triangle-triangle intersection
- Calculates exact penetration depth
- Handles complex geometries (pipes, ducts, etc.)

## Troubleshooting

### "No files to analyze"
- Ensure files have status = 'completed'
- Check file conversion completed successfully
- Verify files contain GLB models

### Clash detection fails
- Check Python worker logs: `docker logs bim_assitant-clash-worker-1`
- Verify MinIO buckets accessible
- Check database connection
- Ensure GLB files exist in MinIO

### No clashes found
- Verify clearance rules match your project requirements
- Check if categories are actually intersecting
- Review clash matrix (some category pairs are not checked)

## API Endpoints

### Generate Report
```http
POST /api/reports/generate
Authorization: Bearer <token>
Content-Type: application/json

{
  "projectId": "uuid",
  "fileIds": ["uuid1", "uuid2"],
  "settings": {}
}
```

### Get Project Reports
```http
GET /api/reports/project/:projectId
Authorization: Bearer <token>
```

### Stream Progress (SSE)
```http
GET /api/progress/clash/:reportId?token=<jwt>
Accept: text/event-stream
```

**Event Format**:
```json
{
  "type": "progress",
  "reportId": "uuid",
  "status": "processing",
  "progress": 45,
  "message": "Detecting clashes...",
  "totalClashes": 12,
  "criticalClashes": 3,
  "majorClashes": 5,
  "minorClashes": 4
}
```

## Future Enhancements

### Planned Features
- [ ] 3D visualization of clash points in Canvas3D
- [ ] Click clash to navigate camera to location
- [ ] Export clash report to Excel/PDF
- [ ] Custom clearance rules per project
- [ ] Clash grouping (resolve multiple at once)
- [ ] Historical clash tracking (trend analysis)
- [ ] Email notifications on completion
- [ ] Batch clash detection for multiple projects

### Advanced Algorithms
- [ ] SAT (Separating Axis Theorem) for primitive shapes
- [ ] GJK (Gilbert-Johnson-Keerthi) for convex meshes
- [ ] Möller triangle-triangle for complex geometries
- [ ] GPU acceleration with CUDA/OpenCL

## Support
For issues or questions:
- Check Docker logs: `docker compose logs clash-worker`
- Review backend logs: `docker compose logs backend`
- Inspect database: `docker compose exec backend npx prisma studio`
- RabbitMQ Management: http://localhost:15672

---

**Version**: 1.0.0  
**Last Updated**: March 9, 2026
