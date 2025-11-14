<p>
  <img src="help/2.jpg" alt="2" width="50%" />
  <img src="help/4.jpg" alt="2" width="50%" />
</p>

# 1. General

## Purpose of the editor

This tool is a custom track editor designed for our favorite simulator.  
Its goal is to provide a more flexible and efficient workflow for building tracks than the in-game editor, while still staying compatible with the game’s assets and logic.

The editor is built around three main views:

- **GamePrimitive Editor**
- **Group Editor**
- **Scene Editor**

Each view focuses on a different “level” of building blocks: basic shapes, reusable modules, and full tracks.


## GamePrimitive Editor

The purpose of the **GamePrimitive Editor** is to recreate the objects used by the game so that we can use them inside this custom editor.

The simulator is built on the Unity engine, and the original 3D assets are packed into internal resource files that are not directly accessible.  
Because of this, any placeable object we want to use here must first be recreated by hand as a simplified version.

Over time, more and more objects will be added to the built-in library.  
The long-term goal is to cover every important placeable object from the game.  
Until we get there, any object that does not yet exist in the library has to be modeled by the user so that it roughly matches the appearance and proportions of the in-game asset.

When the page loads, a **default library** is automatically loaded, containing the GamePrimitives I have already created.  
You can extend this library with your own GamePrimitives at any time.

If you create useful new elements, feel free to export them and share them with me – I am always happy to integrate community-made primitives into the default library.


## Terminology

The editor uses the following basic concepts:

- **(Simple) Primitive**  
  Fundamental geometric shapes (boxes, cylinders, spheres, etc.) provided by the editor.  
  These are the raw building blocks from which we construct GamePrimitives.

- **GamePrimitive**  
  A composite object built from simple primitives.  
  Each GamePrimitive represents one placeable object from the game (for example a wall segment, cone, gate, pole, etc.).  
  These are the objects that the Group and Scene editors work with.


## Group Editor mode

In **Group Editor** mode you can build more complex structures out of existing GamePrimitives.  
These structures are called **Groups**.

Typical examples:

- Building a wall section from a few elementary bricks.
- Creating a staircase, a tower module, or a corner piece from several GamePrimitives.

Groups can also use other Groups as components (nested groups), allowing you to build up more complex modules step by step.  
The only restriction is that a Group cannot include itself recursively (for obvious reasons).


## Scene Editor mode

In **Scene Editor** mode you use **GamePrimitives** and **Groups** to build your actual **Track**, similar to the game’s own editor – but hopefully a bit faster and more comfortable.

In addition to simply placing objects in 3D space, the Scene Editor supports **ControlLines** and **ControlPoints**:

- A **ControlLine** is a path in 3D space, defined by several **ControlPoints**.
- Once a ControlLine is defined, you can automatically “tile” it with GamePrimitives or Groups.
  This allows you to quickly lay out complex, “roller-coaster-like” structures – for example:
  - long curved walls,
  - snake-like tunnels,
  - elevation-changing sections,
  - or entire “roller coaster” style track segments.

With this approach you can design complex, flowing tracks in a fraction of the time it would take to place each object manually.

<p>

  <img src="help/1.jpg" alt="1" width="45%" />
  <img src="help/2.jpg" alt="2" width="45%" />
</p>
<p>
  <img src="help/3.jpg" alt="1" width="45%" />
  <img src="help/4.jpg" alt="2" width="45%" />
</p>


## GamePrimitive Editor

The **GamePrimitive Editor** is where you define the actual building blocks that represent the game’s placeable objects.

In the long run the plan is that every important object will already be present in the built-in library.  
Until then there will inevitably be some objects that:

- exist in the game,
- but have **not yet been reverse-engineered** and added to this editor.

If you want to use such an object in your track, you can recreate it yourself as a new GamePrimitive.


### When do you need to create your own GamePrimitive?

You only need to create a custom GamePrimitive if:

- the object appears in the game’s track editor,
- but you **cannot find** a matching GamePrimitive for it in this editor’s library.

In that case you can approximate the object’s shape and size using the editor’s simple geometric primitives, so that it looks and behaves *close enough* to the original in the final track.


### Step-by-step: recreating an in-game object

1. **Inspect the object in the game’s track editor**

   Open the game’s own track editor and locate the object you want to use.

   For simplicity, place that object at the **origin** and reset its rotation:
   - Position: `(0, 0, 0)`  
   - Rotation: `(0, 0, 0)` on all axes

   This “neutral” pose is what you should also reproduce in the GamePrimitive Editor.

2. **Approximate its dimensions**

   To estimate the object’s main dimensions in game units:

   - Place a **second identical object** next to the first one.
   - Move it along one axis at a time (X, Y, Z) in the in-game editor.
   - Use this to determine:
     - length,
     - width,
     - height,
     - and any important offsets.

   You do not need millimetre-perfect accuracy, but you should be close enough that:
   - objects line up correctly,
   - and spacing feels the same as in the game.

3. **Rebuild the object in the GamePrimitive Editor**

   In this editor:

   - Use **simple primitives** (boxes, cylinders, etc.) to construct a composite GamePrimitive.
   - Place and scale your simple primitives so that, in the editor’s origin with zero rotation, the object:
     - matches the in-game orientation,
     - and roughly matches the measured dimensions.

4. **Use the correct in-game object name**

   The game identifies each placeable object by a specific **internal name**.  
   You need to save your GamePrimitive under that same name so that export/import works correctly.

   To find this name:

   1. In the game, create a small test track containing the object.
   2. Export the track from the game.
   3. Open the exported track file (usually XML or similar) and look for the object’s entry.  
      It will typically look like this:

      ```xml
      <TrackBlueprint xsi:type="TrackBlueprintFlag">
        <itemID>DrawingBoardCone1mx1m01</itemID>
        <instanceID>2</instanceID>
        <position>
          <x>0.2734038</x>
          <y>0</y>
          <z>3.0748744</z>
        </position>
        <rotation>
          <x>-0</x>
          <y>40.0000038</y>
          <z>-0</z>
        </rotation>
      </TrackBlueprint>
      ```

   4. The value of `<itemID>` (for example `DrawingBoardCone1mx1m01`) is the **official object name**.

   When you create your GamePrimitive in this editor, set its name to **exactly** this value.  
   Later, when you export a track from this editor, it will use this name in the generated track file, so the game can correctly map your placement to the original 3D asset.


### Default GamePrimitive library

When the page loads, the editor automatically loads a **default library** that contains the GamePrimitives I have already created.

- You can freely **extend** this library with your own primitives.
- If you create useful, well-made GamePrimitives for objects that are not yet in the default set, you can:
  - export your library,
  - and send it to me by email.

I am happy to merge good community-created primitives into future versions of the default library, so over time fewer and fewer users will need to manually recreate objects.


## Group Editor

The **Group Editor** lets you build more complex, reusable structures out of existing **GamePrimitives** (and even other Groups).

A **Group** is essentially a prefab made of multiple objects:
- it can be placed as a single unit in the Scene Editor,
- but internally it consists of many GamePrimitives (and optionally nested Groups).


### Typical use cases

Some examples of what Groups are good for:

- A straight wall section built from several brick-like GamePrimitives.
- A staircase assembled from repeated step modules.
- A tower, corner module, or facade element made of multiple decorative pieces.
- Any structure that you expect to use **many times** across different tracks.

By turning these into Groups instead of placing each piece manually in every track, you:

- work much faster,
- keep your tracks more consistent,
- and make future edits easier (you can update the Group once, then reuse it).


### Groups using other Groups

Groups are not limited to using only GamePrimitives.  
You can also build a Group **out of other Groups**, for example:

- First, create a `WallSegment` Group.
- Then create a `CornerModule` Group that contains two `WallSegment` instances rotated by 90°.
- Finally, build a `BuildingBlock` Group that arranges several `WallSegment` and `CornerModule` instances.

This allows you to build your content in layers:

1. Simple primitives → **GamePrimitives**  
2. GamePrimitives → **basic Groups**  
3. Basic Groups → **high-level Groups** (modules, buildings, track elements)

> Note: A Group cannot directly or indirectly contain **itself** (no recursive self-reference).  
> The editor prevents such setups, as they would lead to infinite nesting.


### Coordinate system and alignment

When placing objects inside a Group, it is recommended to think in terms of a **local origin**:

- Build the Group around `(0, 0, 0)` in a way that makes sense for snapping later:
  - For a wall, this might be the center of its base.
  - For a tower, it might be the ground-level center point.
- Keep rotations simple where possible (e.g. 0°, 90°, 180°, 270°) so that:
  - Groups are easy to align in the Scene Editor,
  - and snapping behaves predictably.

When you later use this Group in the Scene Editor, you only move/rotate **one object**, but all internal parts follow automatically.


### Naming and library

Each Group has a **name** within the editor’s library.  
It does not need to match any internal game name (unlike GamePrimitives), because Groups are a purely editor-side concept.

You can:

- Create as many Groups as you like.
- Organize them logically (e.g. `Wall_Straight_4m`, `Wall_Corner_Outer`, `Tower_3x3`, etc.).
- Reuse them across multiple tracks.

Your Groups are stored together with the rest of the editor’s data and can be exported/imported along with your GamePrimitives.
