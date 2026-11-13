// Entry for tools/vendor.sh. Lists the three.js and cannon-es classes that games may use, and hangs them on Couch.lib.
// Add a class here, run tools/vendor.sh, then ./build.sh. Anything not listed is left out of master.html.
import {
  ACESFilmicToneMapping, AdditiveBlending, AgXToneMapping, BackSide, MeshPhysicalMaterial, PCFShadowMap, PMREMGenerator, VSMShadowMap, AmbientLight, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CircleGeometry, Color,
  CylinderGeometry, DirectionalLight, DoubleSide, Euler, Float32BufferAttribute, Fog, Group, HemisphereLight, InstancedMesh,
  LatheGeometry, Line, LineBasicMaterial, LineSegments, MathUtils, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  MeshStandardMaterial, Object3D, PerspectiveCamera, PlaneGeometry, PointLight, Quaternion, RepeatWrapping,
  RingGeometry, SRGBColorSpace, Scene, SphereGeometry, SpotLight, TorusGeometry, Vector2, Vector3, WebGLRenderer,
} from 'three';
import {
  Body, Box, ContactMaterial, ConvexPolyhedron, Cylinder, DistanceConstraint, HingeConstraint, LockConstraint, Material,
  NaiveBroadphase, Plane, PointToPointConstraint, Quaternion as CQuaternion, Ray, RaycastResult, SAPBroadphase, Sphere,
  Spring, Vec3, World,
} from 'cannon-es';

Couch.lib = {
  THREE: {
    ACESFilmicToneMapping, AdditiveBlending, AgXToneMapping, BackSide, MeshPhysicalMaterial, PCFShadowMap, PMREMGenerator, VSMShadowMap, AmbientLight, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CircleGeometry, Color,
    CylinderGeometry, DirectionalLight, DoubleSide, Euler, Float32BufferAttribute, Fog, Group, HemisphereLight, InstancedMesh,
    LatheGeometry, Line, LineBasicMaterial, LineSegments, MathUtils, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial,
    MeshStandardMaterial, Object3D, PerspectiveCamera, PlaneGeometry, PointLight, Quaternion, RepeatWrapping,
    RingGeometry, SRGBColorSpace, Scene, SphereGeometry, SpotLight, TorusGeometry, Vector2, Vector3, WebGLRenderer,
  },
  CANNON: {
    Body, Box, ContactMaterial, ConvexPolyhedron, Cylinder, DistanceConstraint, HingeConstraint, LockConstraint, Material,
    NaiveBroadphase, Plane, PointToPointConstraint, Quaternion: CQuaternion, Ray, RaycastResult, SAPBroadphase, Sphere,
    Spring, Vec3, World,
  },
  versions: { three: __THREE_VERSION__, cannon: __CANNON_VERSION__ },
};
