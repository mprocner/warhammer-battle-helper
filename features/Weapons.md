# Weapons feature
## Functionality
- When adding weapon to character sheet add also to database skill associated with this weapon. For example if user adds "HAND_WEAPON", add also "MELEE_BASIC" to the database under "skill" field. Association is stored in `src/data/weapons.json` file.
- In CharacterSheet component i want to add checkbox "add to favourite" like it is in skills section. 
- When user checks this checkbox, weapon should be marked in database as favourite with boolean field `isFavourite`.
- Favourite weapons should be displayed above favourite skills in character details left sidebar.
- On click on favourite weapon in the sidebar, modifier popup should be opened and weapon roll performed. It should work the same way as for favourite skills.
- As output of weapon roll you should also write damage that weapon inflicts. Damage is stored in `damage` field in weapons data.