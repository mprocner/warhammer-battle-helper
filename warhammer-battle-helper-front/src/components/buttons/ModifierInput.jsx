import React from "react";

function ModifierInput(props) {
    return (
            <input
                type="number"
                id={props.id}
                value={props.value}
                step="10"
                min="-60"
                max="60"
                onChange={(e) => props.onChange(e.target.value)}
                placeholder="Modifier"
                className="modifier-input"
            />
    );
}

export default ModifierInput;
