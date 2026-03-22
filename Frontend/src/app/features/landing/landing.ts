import { Component, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import * as THREE from 'three';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, RouterModule],
  templateUrl: './landing.html',
  styleUrl: './landing.scss'
})
export class LandingComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('rendererContainer') rendererContainer!: ElementRef;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private mainObject!: THREE.Group;
  private particlesMesh!: THREE.Points;
  private animationId: number | null = null;

  ngOnInit() { }

  ngAfterViewInit() {
    this.initThreeJs();
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  ngOnDestroy() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }
    window.removeEventListener('resize', this.onWindowResize.bind(this));

    if (this.renderer) {
      this.renderer.dispose();
    }
  }

  // Animation State
  private currentSlideIndex = 0;
  private lastSlideTime = 0;
  private screenContentGroup!: THREE.Group;
  private textureLoader = new THREE.TextureLoader();
  private slideMeshes: THREE.Mesh[] = [];

  private initThreeJs() {
    const container = this.rendererContainer.nativeElement;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // SCENE
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0f172a, 0.005); // Deep Blue-Gray fog

    // CAMERA
    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    this.camera.position.set(6, 0, 18); // Angled view
    this.camera.lookAt(2, 0, 0);

    // RENDERER
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // LIGHTING (Premium Studio Setup)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.5);
    mainLight.position.set(5, 10, 10);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 1024;
    mainLight.shadow.mapSize.height = 1024;
    this.scene.add(mainLight);

    const fillLight = new THREE.SpotLight(0x3b82f6, 5); // Blue fill
    fillLight.position.set(-10, 0, 10);
    this.scene.add(fillLight);

    const rimLight = new THREE.PointLight(0xf472b6, 2); // Pink rim
    rimLight.position.set(0, 5, -5);
    this.scene.add(rimLight);

    // --- 3D OBJECTS ---
    this.mainObject = new THREE.Group();

    // 1. REALISTIC PHONE BODY (Rounded via Extrude)
    const phoneGroup = new THREE.Group();

    // Define Rounded Rect Shape
    const phoneWidth = 5.2;
    const phoneHeight = 10.5;
    const radius = 0.6;
    const shape = new THREE.Shape();
    const x = -phoneWidth / 2;
    const y = -phoneHeight / 2;

    shape.moveTo(x + radius, y + phoneHeight);
    shape.lineTo(x + phoneWidth - radius, y + phoneHeight);
    shape.quadraticCurveTo(x + phoneWidth, y + phoneHeight, x + phoneWidth, y + phoneHeight - radius);
    shape.lineTo(x + phoneWidth, y + radius);
    shape.quadraticCurveTo(x + phoneWidth, y, x + phoneWidth - radius, y);
    shape.lineTo(x + radius, y);
    shape.quadraticCurveTo(x, y, x, y + radius);
    shape.lineTo(x, y + phoneHeight - radius);
    shape.quadraticCurveTo(x, y + phoneHeight, x + radius, y + phoneHeight);

    const extrudeSettings = {
      depth: 0.5,
      bevelEnabled: true,
      bevelSegments: 4,
      bevelSize: 0.05,
      bevelThickness: 0.05
    };

    const caseGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    // Center geometry
    caseGeo.center();

    const caseMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f172a, // Deep midnight blue
      metalness: 0.6,
      roughness: 0.2,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
    });
    const phoneCase = new THREE.Mesh(caseGeo, caseMat);
    phoneCase.castShadow = true;
    phoneGroup.add(phoneCase);

    // Side Band (Metal Frame appearance) - Simulated by the bevels mostly, but let's add buttons
    // Right Side: Power
    const btnGeo = new THREE.BoxGeometry(0.1, 0.8, 0.15);
    const btnMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.9, roughness: 0.2 });
    const powerBtn = new THREE.Mesh(btnGeo, btnMat);
    powerBtn.position.set(phoneWidth / 2 + 0.02, 1.5, 0); // Right side
    phoneGroup.add(powerBtn);

    // Left Side: Volume
    const volUp = new THREE.Mesh(btnGeo, btnMat);
    volUp.position.set(-phoneWidth / 2 - 0.02, 1.8, 0);
    phoneGroup.add(volUp);

    const volDown = new THREE.Mesh(btnGeo, btnMat);
    volDown.position.set(-phoneWidth / 2 - 0.02, 0.8, 0);
    phoneGroup.add(volDown);

    // Screen (Black bezel area)
    const bezelWidth = 4.9;
    const bezelHeight = 10.1;
    // Plane is flat, so we put it slightly above the case front
    // Case Front is at Z ~ 0.3 (due to 0.5 depth + bevels centered)
    // We position elements at safe distance > 0.3
    const bezelGeo = new THREE.PlaneGeometry(bezelWidth, bezelHeight);
    const bezelMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const bezel = new THREE.Mesh(bezelGeo, bezelMat);
    bezel.position.z = 0.32;
    phoneGroup.add(bezel);

    // Notch
    const notchGeo = new THREE.PlaneGeometry(1.8, 0.5);
    const notchMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const notch = new THREE.Mesh(notchGeo, notchMat);
    notch.position.set(0, 4.6, 0.33);
    phoneGroup.add(notch);

    // 2. DYNAMIC SLIDING SCREEN (IMAGE BASED)
    this.screenContentGroup = new THREE.Group();
    // Slides will be stacked at the same position for fading
    this.screenContentGroup.position.z = 0.34; // Above bezel
    phoneGroup.add(this.screenContentGroup);

    const slides = [
      '/assets/mobile_ui_1.png',
      '/assets/mobile_ui_2.png',
      '/assets/mobile_ui_3.png',
      '/assets/mobile_ui_4.png',
      '/assets/mobile_ui_5.png' // Project Pipeline
    ];

    // Adjusted size to fit "backside board" (bezel) better
    const slideGeo = new THREE.PlaneGeometry(4.7, 9.6);
    const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();

    this.slideMeshes = [];

    slides.forEach((path, index) => {
      const texture = this.textureLoader.load(path);
      texture.colorSpace = THREE.SRGBColorSpace;

      texture.anisotropy = maxAnisotropy;
      // Re-enable mipmaps for better downscaling quality (less shimmering/blur at angles)
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.center.set(0.5, 0.5);

      const mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: index === 0 ? 1 : 0 // Start with first visible
      });
      const mesh = new THREE.Mesh(slideGeo, mat);

      mesh.position.set(0, 0, 0); // Stacked
      this.screenContentGroup.add(mesh);
      this.slideMeshes.push(mesh);
    });

    // Add decorative floating elements behind phone
    const partGeo = new THREE.TorusGeometry(0.6, 0.2, 16, 100);
    const partMat = new THREE.MeshStandardMaterial({ color: 0x60a5fa, metalness: 0.8, roughness: 0.2 });

    for (let i = 0; i < 5; i++) {
      const mesh = new THREE.Mesh(partGeo, partMat);
      mesh.position.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, -2 - Math.random() * 5);
      mesh.rotation.x = Math.random() * Math.PI;
      this.scene.add(mesh);
    }

    this.mainObject.add(phoneGroup);
    this.mainObject.rotation.z = 0; // Perfectly vertical

    this.scene.add(this.mainObject);

    this.updateLayout();
    this.animate();
  }

  private animate() {
    this.animationId = requestAnimationFrame(() => this.animate());
    const time = Date.now();

    // 1. Gently Float the Phone
    if (this.mainObject) {
      this.mainObject.position.y = Math.sin(time * 0.001) * 0.2;
    }

    // 2. Cross-Fade Slideshow Logic
    if (this.slideMeshes.length > 0) {
      const cycleDuration = 4000; // 4 seconds per slide
      const fadeDuration = 1000;  // 1 second fade transition

      const totalTime = time;
      const currentCycleIndex = Math.floor(totalTime / cycleDuration);
      const index = currentCycleIndex % this.slideMeshes.length;
      const nextIndex = (index + 1) % this.slideMeshes.length;

      const timeInCycle = totalTime % cycleDuration;
      // Start fading in the last 'fadeDuration' ms of the cycle
      const fadeStartTime = cycleDuration - fadeDuration;

      if (timeInCycle > fadeStartTime) {
        // In Transition
        const fadeProgress = (timeInCycle - fadeStartTime) / fadeDuration; // 0 to 1

        this.slideMeshes.forEach((mesh, i) => {
          if (i === index) (mesh.material as THREE.MeshBasicMaterial).opacity = 1 - fadeProgress;
          else if (i === nextIndex) (mesh.material as THREE.MeshBasicMaterial).opacity = fadeProgress;
          else (mesh.material as THREE.MeshBasicMaterial).opacity = 0;
        });
      } else {
        // Stable State
        this.slideMeshes.forEach((mesh, i) => {
          (mesh.material as THREE.MeshBasicMaterial).opacity = (i === index) ? 1 : 0;
        });
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  private onWindowResize() {
    const container = this.rendererContainer.nativeElement;
    if (container) {
      const width = container.clientWidth;
      const height = container.clientHeight;

      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);

      this.updateLayout();
    }
  }

  private updateLayout() {
    if (!this.mainObject) return;

    const width = window.innerWidth;
    const isMobile = width < 768;

    if (isMobile) {
      // Mobile: Center, Face Front, Slightly smaller
      // Camera looks at (2,0,0), so x=2 is center
      this.mainObject.position.x = 2;
      this.mainObject.rotation.y = 0; // Face forward
      this.mainObject.scale.set(0.85, 0.85, 0.85);

      // Optional: Move up slightly if text covers it? 
      // this.mainObject.position.y = 1; 
    } else {
      // Desktop: Facing Front (Not Diagonal)
      this.mainObject.position.x = 9;
      this.mainObject.rotation.y = 0; // Face forward as requested
      this.mainObject.scale.set(1, 1, 1);
    }
  }
}
