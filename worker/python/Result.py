import json

class Result():
    """ Stores either Ok or Err (union)

    Attributes
    type: either has "ok" or "err"
    value: Contains the stored value of either Ok or Err
    """

    def __init__(self, type, value):
        if type == "Ok" or type == "Err":
            self.type = type
        else:
            raise Exception(f"type has to be either Ok or Err, {type} not allowed")
        self.value = value

    def __str__(self):
        return self.toJson()

    def __repr__(self):
        return f'Result.{self.type}({self.value})'

    def toJson(self):
        return json.dumps({ self.type: self.value })

    @classmethod
    def Ok(cls, value):
        return cls("Ok", value)

    @classmethod
    def Err(cls, value):
        return cls("Err", value)

    def isErr(self):
        return self.type == "Err"

    def isOk(self):
        return self.type == "Ok"



