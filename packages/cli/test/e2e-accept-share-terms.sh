#!/bin/bash
set -e
shopt -s expand_aliases
alias run="node --require tsconfig-paths/register ./bin/run"

echo "Create user 'Alice'"
run users:create -p supersecretpassword > .Alice.yaml

echo "Create a 'Vehicle' card template for 'Alice'"
run items:create-config vehicle -a .Alice.yaml > .template_vehicle.yaml

cat .template_vehicle.yaml |
yq -y '(.spec.label) = "My Vehicle"'|
yq -y '(.spec.slots[0].value) = "20000101"' | 
yq -y '(.spec.slots[1].value) = "ABC123"' |
yq -y '(.spec.slots[2].value) = "Mazda"' |
yq -y '(.spec.slots[3].value) = "Familia"' |
yq -y '(.spec.slots[4].value) = "VIN3322112223"' > .my_vehicle.yaml

echo "Create a 'Vehicle' card for 'Alice'"
run items:create -i .my_vehicle.yaml -a .Alice.yaml > .item_alice.yaml


echo "Create user 'Bob'"
run users:create -p supersecretpassword > .Bob.yaml

echo "Setup a connection between 'Bob' and 'Alice'"
run connections:create-config --from .Alice.yaml --to .Bob.yaml > .connection_Alice_Bob.yaml
run connections:create -c .connection_Alice_Bob.yaml > .connection_Alice_Bob.created.yaml

connectionId=$(cat .connection_Alice_Bob.created.yaml | yq -r .metadata.from_user_connection_id)

itemId=$(cat .item_alice.yaml | yq -r .spec.id)

echo "item id: ${itemId}"
echo "connection id: ${connectionId}"

echo "Share"
run shares:create-config --from .Alice.yaml --connectionId $connectionId -i $itemId > .share_Alice_Bob.yaml

echo "Share the card to 'Bob'"
run shares:create -c .share_Alice_Bob.yaml -t acceptance_required > .share_Alice_Bob.created.yaml

bobsShareId=$(cat .share_Alice_Bob.created.yaml | yq -r '.shares[0].id')
echo "bob's share id: ${bobsShareId}"

echo "Accept incoming share as bob"
run shares:accept -a .Bob.yaml $bobsShareId